#!/usr/bin/env node
// `hunt-job label <jobId> good|bad|clear` — user signal for `calibrate` (§3.6).
import chalk from 'chalk';
import { getDb } from '../core/db.js';

const [jobId, label] = process.argv.slice(2);
if (!jobId || !['good', 'bad', 'clear'].includes(label)) {
  console.error('Usage: hunt-job label <jobId> good|bad|clear');
  process.exit(1);
}
const res = getDb()
  .prepare('UPDATE pipeline SET user_label = ? WHERE job_id = ?')
  .run(label === 'clear' ? null : label, jobId);
if (!res.changes) {
  console.error(chalk.red(`No pipeline row for ${jobId}`));
  process.exit(1);
}
console.log(chalk.green(`${jobId}: ${label}`));
