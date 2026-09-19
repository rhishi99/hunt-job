#!/usr/bin/env node
// `hunt-job calibrate` — docs/fable51-answers.md §3.6.
//   calibrate              report + proposal (no writes)
//   calibrate --accept     create the next score_versions row and re-score pipeline rows
//   calibrate --version N  re-score retroactively under version N (report only)
import chalk from 'chalk';
import ProfileManager from '../core/profileManager.js';
import { getDb } from '../core/db.js';
import { getMinimumApplyScore } from '../core/aiClient.js';
import { ensureScoreVersion, getScoreVersion, DEFAULT_WEIGHTS } from '../core/scoring/score.js';
import { collectSamples, buildCalibration, rescoreAll, acceptWeights, MIN_PER_CLASS } from '../core/scoring/calibrate.js';

const fmt = n => (n == null ? '  -  ' : n.toFixed(2));

async function main() {
  const args = process.argv.slice(2);
  const accept = args.includes('--accept');
  const vIdx = args.indexOf('--version');
  const db = getDb();
  const profile = (await new ProfileManager().loadProfile()) || {};
  const minApply = getMinimumApplyScore();

  if (vIdx !== -1) {
    const row = getScoreVersion(db, Number(args[vIdx + 1]));
    if (!row) throw new Error(`No score_versions row ${args[vIdx + 1]}`);
    const { rescored, moved } = rescoreAll(db, profile, JSON.parse(row.weights), minApply);
    console.log(`Re-scored ${rescored} rows under v${row.version}; ${moved.length} crossed the Apply threshold.`);
    for (const m of moved) console.log(`  ${m.jobId}  ${fmt(m.from)} -> ${fmt(m.to)} (${m.direction})`);
    return;
  }

  const current = ensureScoreVersion(db);
  const weights = JSON.parse(current.weights);
  const cal = buildCalibration(collectSamples(db, profile), weights, DEFAULT_WEIGHTS);

  console.log(chalk.cyan.bold(`\nCalibration vs score v${current.version}  (positives ${cal.nPos}, negatives ${cal.nNeg}; need ${MIN_PER_CLASS} each per component)\n`));
  console.log('component        weight  pos   neg   gap    n+/n-   proposal');
  for (const [k, s] of Object.entries(cal.stats)) {
    console.log(
      `${k.padEnd(16)} ${fmt(weights[k])}  ${fmt(s.meanPos)} ${fmt(s.meanNeg)} ${fmt(s.gap)}  ${String(s.nPos).padStart(3)}/${String(s.nNeg).padEnd(3)}  ${cal.proposed[k].toFixed(3)}${s.nudged ? chalk.green(' *') : ''}`
    );
  }

  if (!cal.changed) {
    console.log(chalk.yellow('\nNot enough consistent signal to propose a change. Keep labelling: hunt-job label <jobId> good|bad'));
    return;
  }
  const { rescored, moved } = rescoreAll(db, profile, cal.proposed, minApply);
  console.log(`\nProposal would move ${moved.length} of ${rescored} rows across the Apply threshold.`);
  for (const m of moved) console.log(`  ${m.jobId}  ${fmt(m.from)} -> ${fmt(m.to)} (${m.direction})`);

  if (!accept) {
    console.log(chalk.gray('\nRun `hunt-job calibrate --accept` to adopt it.'));
    return;
  }
  const version = acceptWeights(db, cal.proposed, `calibrate --accept from ${cal.nPos} positive / ${cal.nNeg} negative outcomes`);
  rescoreAll(db, profile, cal.proposed, minApply, { write: true, version });
  console.log(chalk.green(`\nCreated score v${version} and re-scored ${rescored} rows.`));
}

main().catch(e => {
  console.error(chalk.red(e.message));
  process.exit(1);
});
