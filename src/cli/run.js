#!/usr/bin/env node
/**
 * run.js — `hunt-job run`: the single entry point for the autonomous loop.
 * docs/fable51-answers.md §1 (T1), §0.3 brief 5, §1.8 (first slice).
 *
 * Usage:
 *   node hunt-job.js run [--once] [--dry-run] [--max-tasks <n>]
 *                         [--archetype <name>] [--interval <minutes>]
 *
 * One bounded pass: releaseStale -> scanAll(profile.archetypes) -> prefilterJobs
 * (S1 rules + S2 lexical) -> sync new/changed jobs into the `pipeline` state
 * machine and enqueue `evaluate` tasks for survivors -> drain() with the real
 * evaluate handler (existing JobEvaluator, per §1.8) -> buildDigest -> print +
 * write data/digest/<date>.md/.json + a Windows toast. `watch`/`hunt`/`gigs`
 * are one-line aliases elsewhere (§1.6); this file is the only place the full
 * funnel runs end to end.
 *
 * Without `--once`, loops on `--interval` minutes (default 180 = 3h, §1.6:
 * "3h, not 30 min — ATS boards change slowly").
 *
 * `--dry-run` (not in the design doc — added for safe manual/CI verification
 * of this CLI without ever spending a real LLM call against the paid key in
 * .env): scan and prefilter still run for real (same as `watch`/`scan`
 * already do unattended), but nothing is enqueued, no pipeline state
 * transitions happen, and drain() — the only thing that can make an LLM
 * call — never runs. The evaluate handler is provably never invoked.
 */
import chalk from 'chalk';
import { getDb, closeDb } from '../core/db.js';
import ProfileManager, { getRules } from '../core/profileManager.js';
import { scanAll as defaultScanAll } from '../core/scan/index.js';
import { prefilterJobs } from '../core/pipeline/prefilter.js';
import { transition, ACTORS, RE_EVALUATE_STATES } from '../core/pipeline/states.js';
import { enqueue, releaseStale } from '../core/pipeline/queue.js';
import { drain } from '../core/pipeline/runner.js';
import { record as recordBudget } from '../core/pipeline/budget.js';
import { buildDigest } from '../core/pipeline/digest.js';
import { setRecordHook, getMinimumApplyScore } from '../core/aiClient.js';
import { sha256 } from '../core/pipeline/identity.js';
import JobEvaluator from '../core/jobEvaluator.js';
import { createLogger } from '../core/logger.js';
import { notify } from './watch.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const log = createLogger('cli.run');
const MIN_INTERVAL_MIN = 10;
const DEFAULT_INTERVAL_MIN = 180; // 3h, §1.6
const MAYBE_FLOOR = 3.0; // §1.2: "Evaluated, maybe" bucket floor

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIGEST_DIR = path.join(__dirname, '../../data/digest');

// Wires aiClient's LLM ledger hook to the real budget table exactly once per
// process (§1.4: "aiClient... gets one line after success and one in the
// catch that calls budget.record()"). Safe to call more than once — it just
// replaces the hook with an equivalent closure.
function bootstrapBudgetHook(db) {
  setRecordHook(entry => recordBudget(db, entry));
}

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, maxTasks: Infinity, interval: DEFAULT_INTERVAL_MIN, archetype: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--max-tasks') args.maxTasks = Number(argv[++i]);
    else if (a === '--interval') args.interval = Number(argv[++i]);
    else if (a === '--archetype' || a === '-a') args.archetype = argv[++i];
  }
  return args;
}

/**
 * Resolves `evaluate` task's job input for JobEvaluator (a URL it can fetch,
 * or fall back to the JD text already stored from the scan).
 */
function jobEvaluatorInput(job) {
  return job.url || job.description || null;
}

/**
 * The `evaluate` task handler (§1.8): calls the EXISTING JobEvaluator as-is
 * (scoring v2 is a separate, concurrent rewrite of its internals — this only
 * calls the public `evaluate()` interface, never touches jobEvaluator.js or
 * src/core/scoring/*), then buckets the result into the pipeline state
 * machine (queued -> evaluated -> skip|maybe|shortlisted, §2.3).
 *
 * jobEvaluator.js predates the v5 evaluations columns (job_id/content_hash/
 * score), so this handler fills them in after the fact rather than editing
 * that file.
 */
export function makeEvaluateHandler({ profile, minimumApplyScore }) {
  return async ({ task, db }) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(task.job_id);
    if (!job) throw new Error(`evaluate handler: no job row for ${task.job_id}`);

    const jobInput = jobEvaluatorInput(job);
    if (!jobInput) throw new Error(`evaluate handler: job ${job.id} has neither url nor description`);

    const evaluator = new JobEvaluator();
    const { evaluation, id: evaluationId } = await evaluator.evaluate(jobInput, profile);
    const score = Number(evaluation?.overallScore) || 0;

    db.prepare(`UPDATE evaluations SET job_id = ?, content_hash = ?, score = ? WHERE id = ?`).run(
      job.id,
      job.content_hash,
      score,
      evaluationId
    );

    transition(db, job.id, 'evaluated', { actor: ACTORS.PIPELINE, reason: `score:${score}` });
    const bucket = score >= minimumApplyScore ? 'shortlisted' : score >= MAYBE_FLOOR ? 'maybe' : 'skip';
    transition(db, job.id, bucket, { actor: ACTORS.PIPELINE, reason: `score:${score}` });

    db.prepare(`UPDATE pipeline SET score = ?, evaluation_id = ? WHERE job_id = ?`).run(score, evaluationId, job.id);
  };
}

/** Stable hash of the profile fields the evaluation prompt actually uses (§0.1 idempotency key). */
function profileHash(profile) {
  return sha256(
    JSON.stringify({
      archetypes: profile.archetypes,
      techStack: profile.techStack,
      salary: profile.salary,
      dealbreakers: profile.dealbreakers,
      rules: getRules(profile),
    })
  );
}

/**
 * Syncs prefiltered jobs into the `pipeline` state machine and enqueues
 * `evaluate` tasks for survivors (§1.8 steps b-d). Pure DB read/write, no
 * network, no LLM. In `dryRun` mode nothing is written — only counted, so a
 * caller can preview what a real run would do.
 */
export function syncPipelineAndEnqueue(db, { profile, dryRun = false } = {}) {
  const pHash = profileHash(profile);
  const summary = { discovered: 0, filteredOut: 0, enqueued: 0, requeuedForRescan: 0, alreadyTracked: 0 };

  const rows = db
    .prepare(
      `SELECT j.id, j.content_hash, j.prefilter_score, j.prefilter_reason,
              p.state AS pipelineState, e.content_hash AS evaluatedContentHash
       FROM jobs j
       LEFT JOIN pipeline p ON p.job_id = j.id
       LEFT JOIN evaluations e ON e.id = p.evaluation_id
       WHERE j.prefilter_score IS NOT NULL`
    )
    .all();

  for (const row of rows) {
    const isVetoed = String(row.prefilter_reason || '').startsWith('veto:');

    if (!row.pipelineState) {
      // First time this job has entered the funnel (§2.3 null -> discovered).
      summary.discovered++;
      if (isVetoed) {
        summary.filteredOut++;
        if (dryRun) continue;
        transition(db, row.id, 'discovered', { actor: ACTORS.SCAN, reason: 'scan' });
        transition(db, row.id, 'filtered_out', { actor: ACTORS.PIPELINE, reason: row.prefilter_reason });
        continue;
      }
      summary.enqueued++;
      if (dryRun) continue;
      transition(db, row.id, 'discovered', { actor: ACTORS.SCAN, reason: 'scan' });
      transition(db, row.id, 'queued', { actor: ACTORS.PIPELINE, reason: row.prefilter_reason });
      enqueue(db, 'evaluate', row.id, null, {
        key: `evaluate:${row.id}:${row.content_hash}:${pHash}`,
        priority: Math.round((row.prefilter_score || 0) * 100),
      });
      continue;
    }

    // A previously-evaluated job whose JD changed re-enters the queue (§1.7,
    // §2.4) — unless the (now current) rules would veto it outright.
    const contentChanged = row.evaluatedContentHash && row.evaluatedContentHash !== row.content_hash;
    if (RE_EVALUATE_STATES.includes(row.pipelineState) && contentChanged && !isVetoed) {
      summary.requeuedForRescan++;
      if (dryRun) continue;
      transition(db, row.id, 'queued', { actor: ACTORS.SCAN, reason: 'content_changed' });
      enqueue(db, 'evaluate', row.id, null, {
        key: `evaluate:${row.id}:${row.content_hash}:${pHash}`,
        priority: Math.round((row.prefilter_score || 0) * 100),
      });
      continue;
    }

    summary.alreadyTracked++;
  }

  return summary;
}

/**
 * One bounded pass of the whole funnel (§1.8). Pure orchestration — no
 * console output, no file writes, no toast — so it's directly testable with
 * a fixture DB and a stubbed `scan`/`handlers`. `main()` below is the only
 * caller that does CLI I/O around it.
 *
 * @param {object} [opts]
 * @param {import('better-sqlite3').Database} [opts.db]
 * @param {object} [opts.profile] - defaults to config/profile.yml
 * @param {string[]} [opts.archetypes] - defaults to profile.archetypes
 * @param {boolean} [opts.dryRun]
 * @param {number} [opts.maxTasks]
 * @param {Function} [opts.scan] - defaults to scanAll; tests inject a stub
 * @param {Record<string, Function>} [opts.handlers] - extra/override task
 *   handlers merged over the default { evaluate }; tests inject a stub here
 *   to prove it is (or is not) called.
 * @param {number} [opts.now]
 */
export async function runOnce({
  db = getDb(),
  profile,
  archetypes,
  dryRun = false,
  maxTasks = Infinity,
  scan = defaultScanAll,
  handlers = {},
  now = Date.now(),
} = {}) {
  const resolvedProfile = profile ?? (await new ProfileManager().loadProfile());
  const resolvedArchetypes = archetypes?.length ? archetypes : resolvedProfile.archetypes || [];
  const minimumApplyScore = getMinimumApplyScore();

  bootstrapBudgetHook(db);
  releaseStale(db, { now });

  const scanResult = await scan(resolvedArchetypes);
  const prefilterResult = prefilterJobs(db, { profile: resolvedProfile });
  const syncResult = syncPipelineAndEnqueue(db, { profile: resolvedProfile, dryRun });

  let drainSummary = { claimed: 0, completed: 0, deferred: 0, blocked: 0, failed: 0, stopReason: 'dry_run' };
  if (!dryRun) {
    const evaluateHandler = handlers.evaluate ?? makeEvaluateHandler({ profile: resolvedProfile, minimumApplyScore });
    drainSummary = await drain({ db, handlers: { evaluate: evaluateHandler, ...handlers }, maxTasks, now });
  }

  const dateStr = new Date(now).toISOString().slice(0, 10);
  const digest = await buildDigest(db, dateStr, { profile: resolvedProfile });

  return { scanResult, prefilterResult, syncResult, drainSummary, digest, dateStr };
}

function writeDigestFiles(dateStr, digest) {
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIGEST_DIR, `${dateStr}.md`), digest.markdown, 'utf-8');
  fs.writeFileSync(path.join(DIGEST_DIR, `${dateStr}.json`), JSON.stringify(digest.json, null, 2), 'utf-8');
}

function toastForDigest(digest) {
  const ready = digest.json.readyToApply.length;
  const maybe = digest.json.evaluatedMaybe.length;
  if (!ready && !maybe) return;
  notify(
    `Hunt-Job: ${ready} ready to apply, ${maybe} maybe`,
    digest.json.readyToApply.slice(0, 3).map(r => `${r.title} @ ${r.company}`).join('\n') || 'See the digest for details.'
  );
}

async function runAndReport(opts) {
  const result = await runOnce(opts);
  const { scanResult, prefilterResult, syncResult, drainSummary, digest, dateStr } = result;

  console.log(
    chalk.gray(
      `[${new Date().toISOString()}] scanned ${scanResult.jobs.length} · new ${scanResult.newJobs.length} · ` +
        `closed ${scanResult.closed} · scan errors ${scanResult.errors.length}`
    )
  );
  console.log(
    chalk.gray(
      `prefilter: ${prefilterResult.total} matched · ${prefilterResult.vetoed} vetoed · ${prefilterResult.scored} scored`
    )
  );
  console.log(
    chalk.gray(
      `pipeline: ${syncResult.discovered} discovered · ${syncResult.filteredOut} filtered_out · ` +
        `${syncResult.enqueued} enqueued · ${syncResult.requeuedForRescan} requeued`
    )
  );
  if (opts?.dryRun) {
    console.log(chalk.yellow('--dry-run: no tasks enqueued, no pipeline writes, no LLM calls made.'));
  } else {
    console.log(
      chalk.gray(
        `drain: claimed ${drainSummary.claimed} · completed ${drainSummary.completed} · ` +
          `deferred ${drainSummary.deferred} · blocked ${drainSummary.blocked} · failed ${drainSummary.failed} ` +
          `(${drainSummary.stopReason})`
      )
    );
  }

  writeDigestFiles(dateStr, digest);
  console.log(chalk.cyan.bold(`\n${digest.markdown}\n`));
  console.log(chalk.gray(`Digest written to data/digest/${dateStr}.md (+ .json)`));

  if (!opts?.dryRun) toastForDigest(digest);

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const intervalMin = Math.max(MIN_INTERVAL_MIN, Number.isFinite(args.interval) ? args.interval : DEFAULT_INTERVAL_MIN);
  const runOpts = { dryRun: args.dryRun, maxTasks: args.maxTasks, archetypes: args.archetype ? [args.archetype] : undefined };

  await runAndReport(runOpts);

  if (args.once) {
    closeDb();
    return;
  }

  console.log(chalk.cyan.bold(`\nLooping every ${intervalMin}m. Ctrl+C to stop.\n`));
  let stopped = false;
  process.on('SIGINT', () => {
    if (stopped) return;
    stopped = true;
    console.log(chalk.yellow('\n\nStopping run. Bye!\n'));
    closeDb();
    process.exit(0);
  });

  while (!stopped) {
    await new Promise(r => setTimeout(r, intervalMin * 60 * 1000));
    if (stopped) break;
    await runAndReport(runOpts).catch(err => {
      console.error(chalk.red(`run cycle failed: ${err.message}`));
      log.error('run_cycle_failed', { error: err.message });
    });
  }
}

// Guarded so runOnce/parseArgs/etc. can be imported by tests without running
// the real CLI (same pattern as src/cli/auditPortals.js).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error(chalk.red('Error:'), err.message);
    process.exit(1);
  });
}
