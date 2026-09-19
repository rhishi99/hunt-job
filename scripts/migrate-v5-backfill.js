#!/usr/bin/env node
/**
 * migrate-v5-backfill.js — one-time backfill of `job_id`/content identity onto
 * the pre-v5 `evaluations` and `applications` rows (docs/fable51-answers.md
 * §2.5). Getting `getDb()` also applies the v5 schema migration if it hasn't
 * run yet, so this script is safe to run standalone.
 *
 * What it does (measured 2026-09-19: 17 evaluations / 9 distinct inputs, 3
 * applications):
 *   1. evaluations: resolves each row's stored `url` (a real URL, or pasted
 *      JD text stored in the same column) to a `jobs.id` via the same
 *      identity rules as `ensureJobRow` — but WITHOUT fetching over the
 *      network for URL rows that aren't already in `jobs` (this script makes
 *      no network/LLM calls); those become `description_state='stub'` rows.
 *      Sets job_id, content_hash, profile_hash='legacy', score, score_version=0,
 *      model=null, recommendation. Every row is kept (history).
 *   2. applications: dedupes the check-then-insert race (two inserts for the
 *      same url within an hour keep the first as attempt=1 and delete the
 *      rest), sets job_id, and drives the surviving row's job through the
 *      legal pipeline chain into 'applied' via transition() so `pipeline` +
 *      `pipeline_events` reflect real history.
 *
 * Deviation from a literal reading of "content_hash = sha256(text)": several
 * rows are exact re-evaluations of identical content (same URL/text hashed
 * more than once). The v5 migration's own idx_evaluations_key UNIQUE index
 * on (job_id, content_hash, profile_hash, score_version) would reject
 * inserting/updating two such rows to identical values, yet §2.5 says "keep
 * all 17 (history)". Resolution: within a group of exact duplicates, the
 * chronologically LATEST row gets the true content hash (what future
 * evaluation-reuse lookups should match against); earlier duplicates get
 * content_hash = sha256(raw + a duplicate marker) — still content-derived,
 * still stable, but distinguishable so the unique index holds.
 *
 * Usage: npm run migrate:v5 [-- --dry-run]
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from '../src/core/db.js';
import { canonicalUrl, sha256, normalizeText, isUrl } from '../src/core/pipeline/identity.js';
import { transition } from '../src/core/pipeline/states.js';

const MINIMUM_APPLY_SCORE = 4.0; // config/settings.json — used only to pick the historical pipeline state
const DUPE_APPLICATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour — the check-then-insert race window

const ROLLBACK = Symbol('dry-run-rollback');

/** Finds an existing jobs row for a URL, or creates a stub manual: row (no network call). */
export function resolveOrCreateJobForUrl(db, url, summary) {
  const canonical = canonicalUrl(url);
  const existing = db
    .prepare('SELECT id FROM jobs WHERE canonical_url = ? OR url = ? OR apply_url = ? LIMIT 1')
    .get(canonical, url, url);
  if (existing) return existing.id;

  const id = `manual:${new URL(url).host.toLowerCase()}:${sha256(canonical || url).slice(0, 16)}`;
  const byId = db.prepare('SELECT id FROM jobs WHERE id = ?').get(id);
  if (byId) return byId.id;

  const now = Date.now();
  db.prepare(`
    INSERT INTO jobs (
      id, company_id, ats_platform, title, url, apply_url, description,
      content_hash, status, canonical_url, description_state, first_seen_at, last_seen_at
    ) VALUES (?, 'manual', 'manual', ?, ?, ?, NULL, NULL, 'active', ?, 'stub', ?, ?)
  `).run(id, `Untitled (legacy backfill: ${url})`, url, url, canonical, now, now);
  summary.jobsCreated.push(id);
  return id;
}

/** Finds/creates the manual:text: row for pasted JD text (full text is already in hand). */
export function resolveOrCreateJobForText(db, text, summary) {
  const id = `manual:text:${sha256(normalizeText(text)).slice(0, 16)}`;
  const existing = db.prepare('SELECT id FROM jobs WHERE id = ?').get(id);
  if (existing) return existing.id;

  const titleMatch = text.match(/^(?:Job Title|Position):\s*(.+)$/m);
  const now = Date.now();
  db.prepare(`
    INSERT INTO jobs (
      id, company_id, ats_platform, title, description, content_hash,
      status, description_state, first_seen_at, last_seen_at
    ) VALUES (?, 'manual', 'manual', ?, ?, ?, 'active', 'full', ?, ?)
  `).run(id, titleMatch ? titleMatch[1].trim() : 'Untitled (legacy backfill)', text, sha256(normalizeText(text)), now, now);
  summary.jobsCreated.push(id);
  return id;
}

export function backfillEvaluations(db, summary) {
  const rows = db.prepare('SELECT id, url, evaluation, score, job_id FROM evaluations ORDER BY evaluated_at ASC').all();

  // Group by raw content so exact re-evaluations get a distinguishable content_hash (see header).
  const groups = new Map();
  for (const row of rows) {
    const key = row.url;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const update = db.prepare(`
    UPDATE evaluations
    SET job_id = ?, content_hash = ?, profile_hash = 'legacy', model = NULL,
        score = ?, score_version = 0, recommendation = ?
    WHERE id = ?
  `);

  for (const [raw, groupRows] of groups) {
    const url = isUrl(raw);
    const jobId = url ? resolveOrCreateJobForUrl(db, raw, summary) : resolveOrCreateJobForText(db, raw, summary);

    groupRows.forEach((row, i) => {
      const isLatest = i === groupRows.length - 1;
      const contentHash = isLatest ? sha256(raw) : sha256(`${raw}\u0000dup${i}`);
      let overallScore = null;
      let recommendation = null;
      try {
        const parsed = JSON.parse(row.evaluation);
        overallScore = typeof parsed.overallScore === 'number' ? parsed.overallScore : null;
        recommendation = parsed.recommendation ?? null;
      } catch {
        // legacy row wasn't valid JSON — leave score/recommendation null
      }
      update.run(jobId, contentHash, overallScore, recommendation, row.id);
      summary.evaluationsUpdated.push({ id: row.id, job_id: jobId, dup: !isLatest });
    });
  }
}

export function backfillApplications(db, summary) {
  const rows = db.prepare('SELECT * FROM applications ORDER BY applied_at ASC').all();
  const deleteStmt = db.prepare('DELETE FROM applications WHERE id = ?');
  const updateStmt = db.prepare('UPDATE applications SET job_id = ?, attempt = ? WHERE id = ?');

  // Group by url to find the check-then-insert race duplicates and assign attempt numbers.
  const byUrl = new Map();
  for (const row of rows) {
    if (!byUrl.has(row.url)) byUrl.set(row.url, []);
    byUrl.get(row.url).push(row);
  }

  for (const [url, group] of byUrl) {
    let kept = [];
    for (const row of group) {
      const prev = kept[kept.length - 1];
      const prevMs = prev ? Date.parse(prev.applied_at) : null;
      const thisMs = Date.parse(row.applied_at);
      if (prev && Number.isFinite(prevMs) && Number.isFinite(thisMs) && thisMs - prevMs < DUPE_APPLICATION_WINDOW_MS) {
        deleteStmt.run(row.id);
        summary.applicationsDeleted.push(row.id);
        continue;
      }
      kept.push(row);
    }

    const jobId = url && isUrl(url) ? resolveOrCreateJobForUrl(db, url, summary) : null;

    kept.forEach((row, i) => {
      const attempt = i + 1;
      updateStmt.run(jobId, attempt, row.id);
      summary.applicationsUpdated.push({ id: row.id, job_id: jobId, attempt });

      if (!jobId) return;

      // Idempotent: a re-run (or a second application row for the same job)
      // must not re-drive a pipeline row that's already past 'applying' —
      // transition() correctly rejects e.g. applied -> discovered.
      const already = db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get(jobId);
      if (already) return;

      // Drive the job through the legal chain into 'applied' so pipeline/pipeline_events
      // reflect real history (§2.3). Score decides the pre-apply state; a real
      // application means the job cleared at least 'maybe'.
      const evalRow = db.prepare('SELECT score FROM evaluations WHERE job_id = ? ORDER BY evaluated_at DESC LIMIT 1').get(jobId);
      const score = evalRow?.score ?? null;
      const preState = score !== null && score >= MINIMUM_APPLY_SCORE ? 'shortlisted' : 'maybe';

      const reason = `migrate-v5-backfill: reconstructed from application ${row.id}`;
      transition(db, jobId, 'discovered', { actor: 'scan', reason });
      transition(db, jobId, 'queued', { actor: 'pipeline', reason });
      transition(db, jobId, 'evaluated', { actor: 'pipeline', reason });
      transition(db, jobId, preState, { actor: 'pipeline', reason });
      transition(db, jobId, 'applying', { actor: 'user:cli', reason });
      transition(db, jobId, 'applied', { actor: 'user:cli', reason });
      summary.pipelineRowsCreated.push({ job_id: jobId, state: 'applied' });
    });
  }
}

/**
 * Runs the full backfill against `db` inside one transaction. With
 * `dryRun: true` every statement still executes (so counts/constraints are
 * real) but the transaction is rolled back at the end via a thrown sentinel.
 * Exported so tests can run it against a fixture DB without touching the
 * real data/hunt-job.db.
 */
export function runBackfill(db, { dryRun = false } = {}) {
  const summary = {
    jobsCreated: [],
    evaluationsUpdated: [],
    applicationsUpdated: [],
    applicationsDeleted: [],
    pipelineRowsCreated: [],
  };

  const exec = () => {
    backfillEvaluations(db, summary);
    backfillApplications(db, summary);
    if (dryRun) throw ROLLBACK;
  };

  try {
    db.transaction(exec)();
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }

  return summary;
}

function printReport(summary, dryRun) {
  console.log(`${dryRun ? '[dry-run] ' : ''}migrate-v5-backfill report:`);
  console.log(`  evaluations updated: ${summary.evaluationsUpdated.length} (dup-hash: ${summary.evaluationsUpdated.filter(e => e.dup).length})`);
  console.log(`  applications updated: ${summary.applicationsUpdated.length}`);
  console.log(`  applications deleted (race dupes): ${summary.applicationsDeleted.length} ${JSON.stringify(summary.applicationsDeleted)}`);
  console.log(`  manual: jobs rows created: ${summary.jobsCreated.length}`);
  console.log(`  pipeline rows created (applied): ${summary.pipelineRowsCreated.length}`);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = getDb();
  const summary = runBackfill(db, { dryRun });
  printReport(summary, dryRun);
  closeDb();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
