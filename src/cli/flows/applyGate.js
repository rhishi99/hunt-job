/**
 * applyGate.js — shared by scanFlow, browseFlow (B-21) and applyFlow (B-17).
 * Finds the latest stored evaluation for a picked job, and asks for explicit
 * confirmation before opening the apply browser for a job scoring below
 * `minimumApplyScore`. Pure DB/logic; the prompt is injectable for tests.
 */
import { sha256, normalizeText, canonicalUrl } from '../../core/pipeline/identity.js';

/**
 * Latest evaluation for a job, matched by jobs.id, by the manual:text id the
 * evaluator derives from pasted JD text, or by url. Returns
 * `{ id, score, recommendation }` or null.
 */
export function latestEvaluation(db, job = {}, jobInput = '') {
  const ids = [];
  if (job.id) ids.push(job.id);
  if (typeof jobInput === 'string' && jobInput.trim() && !/^https?:\/\//i.test(jobInput.trim())) {
    ids.push(`manual:text:${sha256(normalizeText(jobInput)).slice(0, 16)}`);
  }
  const urls = [job.url, job.applyUrl, canonicalUrl(job.url || '')].filter(Boolean);
  const clauses = [];
  const params = [];
  if (ids.length) { clauses.push(`job_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  if (urls.length) { clauses.push(`url IN (${urls.map(() => '?').join(',')})`); params.push(...urls); }
  if (!clauses.length) return null;

  const row = db
    .prepare(
      `SELECT id, score, recommendation, evaluation FROM evaluations
       WHERE (${clauses.join(' OR ')}) ORDER BY evaluated_at DESC LIMIT 1`
    )
    .get(...params);
  if (!row) return null;

  let score = row.score;
  let recommendation = row.recommendation;
  if (score == null || recommendation == null) {
    try {
      const e = JSON.parse(row.evaluation);
      score = score ?? e.overallScore ?? null;
      recommendation = recommendation ?? e.recommendation ?? null;
    } catch { /* keep nulls */ }
  }
  return { id: row.id, score: score == null ? null : Number(score), recommendation: recommendation ?? null };
}

/**
 * B-21: true = proceed. Only prompts when a stored score exists AND is below
 * `minScore`; an un-evaluated job proceeds (nothing to gate on).
 * @param {{confirm?: (msg: string) => Promise<boolean>}} [opts]
 */
export async function confirmApplyBelowThreshold(db, job, jobInput, minScore, opts = {}) {
  const ev = latestEvaluation(db, job, jobInput);
  if (!ev || ev.score == null || ev.score >= minScore) return true;

  const message =
    `Score ${ev.score.toFixed(1)}${ev.recommendation ? ` (${ev.recommendation})` : ''} is below your ` +
    `${minScore.toFixed(1)} apply threshold. Open the apply browser anyway?`;
  if (opts.confirm) return !!(await opts.confirm(message));

  const { default: inquirer } = await import('inquirer');
  const { go } = await inquirer.prompt([{ type: 'confirm', name: 'go', message, default: false }]);
  return go;
}

/**
 * B-17: fields snapshotted into `applications` at apply time so later
 * re-scores never rewrite what the user saw when they applied.
 */
export function evaluationSnapshot(db, job = {}, jobInput = '') {
  const ev = latestEvaluation(db, job, jobInput);
  const jobId = job.id || null;
  const attempt = jobId
    ? (db.prepare('SELECT MAX(attempt) AS m FROM applications WHERE job_id = ?').get(jobId).m || 0) + 1
    : 1;
  return {
    jobId,
    attempt,
    evaluationId: ev?.id ?? null,
    evaluationScore: ev?.score ?? null,
    recommendation: ev?.recommendation ?? null,
  };
}
