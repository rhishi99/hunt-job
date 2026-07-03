#!/usr/bin/env node
/**
 * listJobs.js — `hunt-job list`: INSTANT browse of already-scanned jobs from
 * the SQLite `jobs` table. No network. Same filters as `scan`. This is the
 * fast path — run `scan` once, then slice the results however you like.
 */
import chalk from 'chalk';
import { queryJobs } from '../core/scan/query.js';
import { closeDb } from '../core/db.js';
import { parseFilterArgs, printJobs, FILTER_HELP } from './jobBrowse.js';

const o = parseFilterArgs(process.argv.slice(2));

if (o.help) {
  console.log(`\nUsage: node hunt-job.js list [filters]\n${FILTER_HELP}`);
  console.log('  Reads the saved jobs table — instant, offline. Run `scan` first to populate it.\n');
  process.exit(0);
}

try {
  const jobs = queryJobs(o);
  printJobs(jobs, o);
  if (!o.json && !jobs.length) {
    console.log(chalk.dim('  Nothing saved yet? Run:  node hunt-job.js scan --archetype "<role>"\n'));
  }
} catch (err) {
  console.error(chalk.red('List error:'), err.message);
  process.exitCode = 1;
} finally {
  closeDb();
}
