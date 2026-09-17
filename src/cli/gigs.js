#!/usr/bin/env node
/**
 * gigs.js — `hunt-job gigs`: part-time / contract opportunity hunt.
 *
 * Why this exists rather than `scan --part-time`: `scan` takes exactly ONE
 * archetype, but someone looking for a side engagement will take any of their
 * archetypes — DevOps, SRE, Platform, Cloud. This fans out across every
 * archetype in the profile, unions the results, and keeps only non-full-time
 * commitments.
 *
 * Location default is deliberately inverted vs the rest of the app: gig work is
 * remote-first and the good sources (Remotive, Himalayas) are worldwide-remote
 * boards, so the India filter would drop nearly everything. Pass --india to
 * restore the usual behaviour.
 *
 * Usage:
 *   node hunt-job.js gigs                    # scan + list (all profile archetypes)
 *   node hunt-job.js gigs --offline          # instant, DB only, no network
 *   node hunt-job.js gigs --commitment contract --limit 20
 *   node hunt-job.js gigs --india            # restrict to India locations
 *   node hunt-job.js gigs --json
 */
import chalk from 'chalk';
import ProfileManager from '../core/profileManager.js';
import { scanAll } from '../core/scan/index.js';
import { queryJobs, filterJobs } from '../core/scan/query.js';
import { closeDb } from '../core/db.js';
import { parseFilterArgs, printJobs } from './jobBrowse.js';

const GIG_TYPES = ['part-time', 'contract'];

const HELP = `
Usage: node hunt-job.js gigs [options]

  Hunts part-time / contract work across EVERY archetype in your profile,
  not just one. Remote-worldwide by default (gig sources are global).

OPTIONS
      --offline            Query the saved jobs table only — instant, no network
  -a, --archetype <role>   Override the profile archetypes with a single role
      --commitment <csv>   Default: part-time,contract
      --india              Apply the usual India-only location filter
  -s, --since <days>       Only postings newer than N days
  -n, --limit <n>          Cap results (default 40)
  -c, --company <text>     Company name contains <text>
  -p, --platform <ats>     remotive | himalayas | lever | ...
      --json               Machine-readable output
  -h, --help               Show this help

Tip: seed the aggregator sources once with  npm run seed:aggregators
`;

const o = parseFilterArgs(process.argv.slice(2));
const argv = process.argv.slice(2);
const offline = argv.includes('--offline');
const indiaOnly = argv.includes('--india');

if (o.help) {
  console.log(HELP);
  process.exit(0);
}

// Gig commitments unless the user named specific ones.
if (!o.employmentType) o.employmentType = GIG_TYPES;
// Gig work is remote-first; opt back in to the India filter with --india.
if (!indiaOnly && !o.location && !o.remote) o.allLocations = true;
if (!o.limit) o.limit = 40;

async function archetypesToHunt() {
  if (o.archetype) return [o.archetype];
  const profile = await new ProfileManager().loadProfile();
  const list = profile?.archetypes?.length ? profile.archetypes : null;
  if (!list) {
    console.error(chalk.yellow(
      'No archetypes in profile and no --archetype given. Run: npm run profile:seed'
    ));
    process.exit(1);
  }
  return list;
}

/** Unions jobs from several archetype passes, de-duped by job id. */
function unionById(lists) {
  const seen = new Map();
  for (const list of lists) for (const j of list) if (!seen.has(j.id)) seen.set(j.id, j);
  return [...seen.values()];
}

async function main() {
  const archetypes = await archetypesToHunt();

  if (!o.json) {
    console.log(chalk.cyan.bold('\n🎯 Gig hunt') +
      chalk.gray(`  ·  ${archetypes.length} archetype${archetypes.length === 1 ? '' : 's'}`) +
      chalk.gray(`  ·  ${o.employmentType.join(' / ')}`) +
      chalk.gray(offline ? '  ·  offline' : '  ·  live scan'));
    console.log(chalk.gray(`   ${archetypes.join(' · ')}\n`));
  }

  let jobs;
  if (offline) {
    // One DB read, filtered per archetype in memory — cheaper than N queries.
    const all = queryJobs({ ...o, archetype: undefined, limit: undefined });
    jobs = unionById(archetypes.map(a => filterJobs(all, { ...o, archetype: a, limit: undefined })));
  } else {
    // One pass for ALL archetypes — scanAll matches a job if it fits any of
    // them, so each company's board is fetched once, not once per archetype.
    const { jobs: found, errors } = await scanAll(archetypes, { includeAllLocations: !indiaOnly });
    if (errors.length && !o.json) {
      console.log(chalk.dim(`   ${found.length} matched · ${errors.length} source error(s)`));
    }
    jobs = filterJobs(found, { ...o, archetype: undefined, limit: undefined });
  }

  jobs.sort((a, b) => (b.postedAt || b.firstSeenAt || 0) - (a.postedAt || a.firstSeenAt || 0));
  if (o.limit > 0) jobs = jobs.slice(0, o.limit);

  printJobs(jobs, o);

  if (!o.json && !jobs.length) {
    console.log(chalk.dim('  No gigs yet. Try:'));
    console.log(chalk.dim('    npm run seed:aggregators     # register Remotive + Himalayas'));
    console.log(chalk.dim('    npm run backfill:commitment  # tag already-scanned jobs\n'));
  }
}

main()
  .catch(err => {
    console.error(chalk.red('Gig hunt error:'), err.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
