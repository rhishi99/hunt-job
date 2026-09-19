// Calibration report + guarded weight proposal — docs/fable51-answers.md §3.6.
//
// Not a model: per-component mean among positives vs negatives, and a bounded
// x1.25 nudge when there is enough data and the gap is consistent. Weights
// change only on explicit accept (a new score_versions row); every version is
// kept, so drift can't happen silently. Re-scoring reads stored extractions —
// no LLM calls.
import { validateExtraction } from './validate.js';
import { computeComponents, aggregateScore, recommend, DEFAULT_WEIGHTS } from './score.js';

export const MIN_PER_CLASS = 15;
export const MIN_GAP = 0.15;
export const NUDGE = 1.25;
export const BOUND_LOW = 0.5;
export const BOUND_HIGH = 2;

const POSITIVE_STATES = ['interview', 'offer'];

/**
 * Class of a pipeline row: 'pos' (interview/offer/good), 'neg' (rejected
 * before ever reaching interview, or bad), else null. A user label wins over
 * the employer outcome because it arrives first and is explicit.
 */
export function classifyRow({ state, user_label: label, reachedInterview }) {
  if (label === 'good') return 'pos';
  if (label === 'bad') return 'neg';
  if (POSITIVE_STATES.includes(state)) return 'pos';
  if (state === 'rejected' && !reachedInterview) return 'neg';
  return null;
}

/** Recompute components for one stored evaluation. Returns null if it can't be rebuilt. */
export function componentsFromStored(evalRow, jobRow, profile) {
  if (!evalRow?.extraction || !jobRow?.description) return null;
  let facts;
  try {
    facts = JSON.parse(evalRow.extraction);
  } catch {
    return null;
  }
  const validated = validateExtraction(facts, jobRow.description, profile);
  return computeComponents(validated.facts, profile, validated.skillCoverage, jobRow.posted_at);
}

function loadPipelineRows(db) {
  return db
    .prepare(
      `SELECT p.job_id, p.state, p.user_label, p.score, p.score_version, p.evaluation_id,
              EXISTS (SELECT 1 FROM pipeline_events e WHERE e.job_id = p.job_id AND e.to_state = 'interview') AS reachedInterview
       FROM pipeline p WHERE p.evaluation_id IS NOT NULL`
    )
    .all();
}

/** Labelled samples: [{ jobId, cls, components }]. */
export function collectSamples(db, profile) {
  const samples = [];
  for (const row of loadPipelineRows(db)) {
    const cls = classifyRow(row);
    if (!cls) continue;
    const evalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(row.evaluation_id);
    const jobRow = db.prepare('SELECT * FROM jobs WHERE id = ?').get(row.job_id);
    const components = componentsFromStored(evalRow, jobRow, profile);
    if (components) samples.push({ jobId: row.job_id, cls, components });
  }
  return samples;
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Per-component stats plus a proposed weight set. Pure. */
export function buildCalibration(samples, currentWeights, baseWeights = DEFAULT_WEIGHTS) {
  const stats = {};
  const raw = { ...currentWeights };
  for (const key of Object.keys(currentWeights)) {
    const pos = samples.filter(s => s.cls === 'pos' && s.components[key] != null).map(s => s.components[key]);
    const neg = samples.filter(s => s.cls === 'neg' && s.components[key] != null).map(s => s.components[key]);
    const meanPos = mean(pos);
    const meanNeg = mean(neg);
    const gap = meanPos != null && meanNeg != null ? meanPos - meanNeg : null;
    const enough = pos.length >= MIN_PER_CLASS && neg.length >= MIN_PER_CLASS;
    const nudged = enough && gap >= MIN_GAP;
    if (nudged) {
      const base = baseWeights[key] ?? currentWeights[key];
      raw[key] = Math.min(base * BOUND_HIGH, Math.max(base * BOUND_LOW, currentWeights[key] * NUDGE));
    }
    stats[key] = { nPos: pos.length, nNeg: neg.length, meanPos, meanNeg, gap, nudged };
  }
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const proposed = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((v / total) * 1e4) / 1e4]));
  const changed = Object.values(stats).some(s => s.nudged);
  return { stats, proposed, changed, nPos: samples.filter(s => s.cls === 'pos').length, nNeg: samples.filter(s => s.cls === 'neg').length };
}

/**
 * Re-score every evaluated pipeline row under `weights` from stored extractions.
 * Returns what moved across the Apply threshold; writes pipeline.score/
 * score_version only when `write` and `version` are given.
 */
export function rescoreAll(db, profile, weights, minimumApplyScore, { write = false, version = null } = {}) {
  const moved = [];
  let rescored = 0;
  for (const row of db.prepare('SELECT job_id, score, evaluation_id FROM pipeline WHERE evaluation_id IS NOT NULL').all()) {
    const evalRow = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(row.evaluation_id);
    const jobRow = db.prepare('SELECT * FROM jobs WHERE id = ?').get(row.job_id);
    const components = componentsFromStored(evalRow, jobRow, profile);
    if (!components) continue;
    // Vetoed rows (score 0) stay vetoed: vetoes are rules, not weights.
    if (row.score === 0) continue;
    const { score, coverage } = aggregateScore(components, weights);
    rescored++;
    const before = row.score != null && row.score >= minimumApplyScore;
    const after = recommend(score, coverage, minimumApplyScore) === 'Apply';
    if (before !== after) moved.push({ jobId: row.job_id, from: row.score, to: score, direction: after ? 'up' : 'down' });
    if (write && version != null) {
      db.prepare('UPDATE pipeline SET score = ?, score_version = ? WHERE job_id = ?').run(score, version, row.job_id);
    }
  }
  return { rescored, moved };
}

/** Insert the next score_versions row. */
export function acceptWeights(db, weights, reason) {
  const next = (db.prepare('SELECT MAX(version) AS v FROM score_versions').get().v || 0) + 1;
  db.prepare('INSERT INTO score_versions (version, weights, created_at, reason) VALUES (?, ?, ?, ?)').run(
    next,
    JSON.stringify(weights),
    Date.now(),
    reason
  );
  return next;
}
