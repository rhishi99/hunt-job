#!/usr/bin/env node
/**
 * scanPortals.js — `hunt-job scan`: LIVE scan of company ATS boards, then
 * filter + print. Every posting is upserted into the jobs table by scanAll(),
 * so after one scan you can browse instantly with `hunt-job list`.
 */
import 'dotenv/config';
import chalk from 'chalk';
import { scanAll } from '../core/scan/index.js';
import { filterJobs } from '../core/scan/query.js';
import { closeDb } from '../core/db.js';
import { parseFilterArgs, printJobs, FILTER_HELP } from './jobBrowse.js';

async function main() {
  const o = parseFilterArgs(process.argv.slice(2));

  if (o.help || !o.archetype) {
    if (!o.archetype && !o.help) console.error(chalk.red('Error: --archetype is required.'));
    console.log(`\nUsage: node hunt-job.js scan --archetype "<role>" [filters]\n${FILTER_HELP}`);
    console.log('  Tip: after one scan, `hunt-job list` re-filters saved jobs instantly (no network).\n');
    process.exit(o.help ? 0 : 1);
  }

  console.log(chalk.cyan.bold(`\n🔍 Scanning live for "${o.archetype}" roles...\n`));

  // Bypass scanAll's built-in India filter only when the user widened location
  // scope, so their --location/--remote/--all filter can take over.
  const wideLocation = Boolean(o.location || o.remote || o.allLocations);
  const { jobs, newJobs, closed, errors } = await scanAll(o.archetype, { includeAllLocations: wideLocation });

  let results = (o.newHours ? newJobs : jobs).map(j => ({
    id: j.id, title: j.title, company: j.company, location: j.location,
    url: j.url, applyUrl: j.applyUrl, description: j.description,
    source: j.source, postedAt: j.postedAt, firstSeenAt: null,
  }));

  // Archetype + broad-location already applied inside scanAll; apply the rest.
  results = filterJobs(results, { ...o, archetype: undefined, newHours: undefined });

  console.log(chalk.gray(
    `scanned · ${jobs.length} matched · ${newJobs.length} new · ${closed} closed · ${errors.length} errors`
  ));
  if (errors.length) errors.slice(0, 5).forEach(e => console.log(chalk.yellow(`  ⚠ ${e.company}: ${e.error}`)));

  printJobs(results, o);
  closeDb();
}

main().catch(err => {
  console.error(chalk.red('Scan error:'), err.message);
  process.exit(1);
});
