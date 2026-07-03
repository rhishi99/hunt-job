/**
 * jobBrowse.js — shared CLI plumbing for `scan` (live) and `list` (instant DB).
 * Parses the common filter flags and pretty-prints a job list. Keeping this in
 * one place means scan and list stay in lockstep on flags + output.
 */
import chalk from 'chalk';
import { daysAgoLabel } from '../core/scan/normalize.js';

export const FILTER_HELP = `
FILTERS (shared by scan + list):
  -a, --archetype <role>   Role to match (e.g. "Backend Engineer")   [required for scan]
  -s, --since <days>       Only postings newer than N days
      --new                Only jobs first seen in the last 48h
      --new-hours <h>      Only jobs first seen in the last H hours
  -n, --limit <n>          Cap results
  -c, --company <text>     Company name contains <text>
  -l, --location <text>    Location contains <text>  (overrides India default)
      --remote             Remote / anywhere / worldwide only
      --all, --all-locations   Do not restrict to India
  -p, --platform <ats>     greenhouse | lever | ashby | ...
      --companies <csv>    (scan only) restrict the live scan to these companies
      --json               Machine-readable JSON output
  -h, --help               Show this help
`;

export function parseFilterArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--archetype': case '-a': o.archetype = next(); break;
      case '--since': case '-s': o.sinceDays = Number(next()); break;
      case '--new': o.newHours = 48; break;
      case '--new-hours': o.newHours = Number(next()); break;
      case '--limit': case '-n': o.limit = Number(next()); break;
      case '--company': case '-c': o.company = next(); break;
      case '--location': case '-l': o.location = next(); break;
      case '--remote': o.remote = true; break;
      case '--all': case '--all-locations': o.allLocations = true; break;
      case '--platform': case '-p': o.platform = next(); break;
      case '--companies': o.companies = next(); break;
      case '--json': o.json = true; break;
      case '--help': case '-h': o.help = true; break;
      default: break;
    }
  }
  return o;
}

const isNew = j => {
  const now = Date.now();
  return (j.firstSeenAt && now - j.firstSeenAt < 172800000) || (j.postedAt && now - j.postedAt < 172800000);
};

export function printJobs(jobs, o = {}) {
  if (o.json) {
    console.log(JSON.stringify(jobs, null, 2));
    return;
  }
  if (!jobs.length) {
    console.log(chalk.yellow('\nNo matching jobs. Broaden the role, raise --since, or add --all-locations.\n'));
    return;
  }
  const newCount = jobs.filter(isNew).length;
  console.log(chalk.green.bold(`\n${jobs.length} job${jobs.length === 1 ? '' : 's'}`) +
    (newCount ? chalk.red(`  ·  ${newCount} 🔥 new`) : '') + '\n');

  jobs.forEach((j, i) => {
    const age = daysAgoLabel(j.postedAt);
    const badge = isNew(j) ? chalk.bgRed.white.bold(' NEW ') + ' ' : '';
    console.log(chalk.cyan.bold(`${String(i + 1).padStart(3)}. `) + badge + chalk.white.bold(j.title));
    console.log(chalk.gray(`     ${j.company}`) + chalk.gray(`  ·  ${j.location || 'India'}`) +
      (age ? chalk.gray(`  ·  ${age}`) : '') + (j.source ? chalk.gray(`  ·  ${j.source}`) : ''));
    if (j.url) console.log(chalk.blue.underline(`     ${j.url}`));
  });
  console.log(chalk.dim('\n💡 Evaluate one:  node hunt-job.js evaluate "<url>"\n'));
}
