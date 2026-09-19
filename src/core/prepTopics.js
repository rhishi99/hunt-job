// T5 prep loop — docs/fable51-answers.md §7. Deterministic (no LLM) topic
// derivation from extraction gaps, plus checklist progress + quiz sessions.
import fs from 'node:fs';
import path from 'node:path';
import { buildCandidateLexicon, skillCovered, normalizeSkill } from './scoring/validate.js';

// Jobs the user is actively working towards (§7.3): shortlisted..interview.
export const PREP_STATES = ['shortlisted', 'prepared', 'applying', 'applied', 'acknowledged', 'screening', 'interview'];
export const STATUSES = ['todo', 'practicing', 'confident'];

export function topicKey(label) {
  return String(normalizeSkill(label)).replace(/[^a-z0-9+#.]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseFacts(json) {
  try { return JSON.parse(json) || {}; } catch { return {}; }
}

/**
 * Recomputes gap topics from the latest extraction of every job in PREP_STATES.
 * Weight = sum(score/5) over source jobs. Jobs that left those states drop out;
 * topics with no remaining source are deleted (progress kept only for live topics).
 * interview_feedback topics are never touched.
 * @returns {{topics: number, jobs: number}}
 */
export function deriveTopics(db, profile, now = Date.now()) {
  const lexicon = buildCandidateLexicon(profile);
  const marks = PREP_STATES.map(() => '?').join(',');
  const jobs = db.prepare(
    `SELECT p.job_id, COALESCE(p.score, 0) AS score,
       (SELECT e.extraction FROM evaluations e WHERE e.job_id = p.job_id AND e.extraction IS NOT NULL
         ORDER BY e.evaluated_at DESC LIMIT 1) AS extraction
     FROM pipeline p WHERE p.state IN (${marks})`
  ).all(...PREP_STATES);

  const acc = new Map();
  const add = (key, label, category, jobId, score) => {
    if (!key) return;
    const t = acc.get(key) || { label, category, weight: 0, jobs: new Set(), source: 'gap' };
    if (!t.jobs.has(jobId)) { t.jobs.add(jobId); t.weight += score / 5; }
    acc.set(key, t);
  };

  for (const j of jobs) {
    if (!j.extraction) continue;
    const facts = parseFacts(j.extraction);
    for (const s of facts.must_have_skills || []) {
      const value = typeof s === 'string' ? s : s?.value;
      if (value && !skillCovered(value, lexicon)) add(topicKey(value), value, 'tool', j.job_id, j.score);
    }
    const sen = facts.seniority?.value;
    if (sen === 'staff' || sen === 'lead') add('system_design', 'System design', 'system_design', j.job_id, j.score);
  }

  const upsert = db.prepare(
    `INSERT INTO prep_topics (topic_key, label, category, weight, source_job_ids, source, updated_at)
     VALUES (?, ?, ?, ?, ?, 'gap', ?)
     ON CONFLICT(topic_key) DO UPDATE SET label = excluded.label, category = excluded.category,
       weight = excluded.weight, source_job_ids = excluded.source_job_ids, updated_at = excluded.updated_at`
  );
  const ensureProgress = db.prepare(`INSERT OR IGNORE INTO prep_progress (topic_key) VALUES (?)`);
  db.transaction(() => {
    for (const [key, t] of acc) {
      upsert.run(key, t.label, t.category, Math.round(t.weight * 1000) / 1000, JSON.stringify([...t.jobs]), now);
      ensureProgress.run(key);
    }
    const stale = db.prepare(`SELECT topic_key FROM prep_topics WHERE source = 'gap'`).all()
      .map(r => r.topic_key).filter(k => !acc.has(k));
    for (const k of stale) {
      db.prepare('DELETE FROM prep_progress WHERE topic_key = ?').run(k);
      db.prepare('DELETE FROM prep_topics WHERE topic_key = ?').run(k);
    }
  })();
  return { topics: acc.size, jobs: jobs.length };
}

/** Topics (with progress) wanted by a job, or all topics when jobId is omitted. Heaviest first. */
export function listTopics(db, { jobId = null, limit = 0 } = {}) {
  const rows = db.prepare(
    `SELECT t.topic_key, t.label, t.category, t.weight, t.source_job_ids,
            COALESCE(g.status, 'todo') AS status, g.self_rating, g.last_practiced_at, g.notes
     FROM prep_topics t LEFT JOIN prep_progress g ON g.topic_key = t.topic_key
     ORDER BY t.weight DESC, t.topic_key`
  ).all().map(r => ({ ...r, jobs: JSON.parse(r.source_job_ids || '[]') }));
  const out = jobId ? rows.filter(r => r.jobs.includes(jobId)) : rows;
  return limit ? out.slice(0, limit) : out;
}

/** Resolve a user-typed key/label/index to a topic_key, or null. */
export function resolveTopic(db, input) {
  const k = topicKey(input);
  return db.prepare('SELECT topic_key FROM prep_topics WHERE topic_key = ?').get(k)?.topic_key ?? null;
}

export function setProgress(db, key, { status, rating, notes } = {}, now = Date.now()) {
  if (status !== undefined && !STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('|')}`);
  if (rating !== undefined && !(rating >= 1 && rating <= 3)) throw new Error('rating must be 1-3');
  if (!db.prepare('SELECT 1 FROM prep_topics WHERE topic_key = ?').get(key)) throw new Error(`unknown topic: ${key}`);
  db.prepare('INSERT OR IGNORE INTO prep_progress (topic_key) VALUES (?)').run(key);
  db.prepare(
    `UPDATE prep_progress SET status = COALESCE(?, status), self_rating = COALESCE(?, self_rating),
       notes = COALESCE(?, notes), last_practiced_at = ? WHERE topic_key = ?`
  ).run(status ?? null, rating ?? null, notes ?? null, now, key);
}

/** Store a quiz session; 3 sessions >= 8/10 promote the topic to 'confident'. */
export function recordSession(db, { topicKey: key, jobId = null, kind = 'quiz', score }, now = Date.now()) {
  db.prepare('INSERT INTO prep_sessions (topic_key, job_id, kind, score, at) VALUES (?, ?, ?, ?, ?)')
    .run(key, jobId, kind, score, now);
  const good = db.prepare(`SELECT COUNT(*) AS n FROM prep_sessions WHERE topic_key = ? AND kind = 'quiz' AND score >= 8`).get(key).n;
  const suggestConfident = good >= 3;
  if (suggestConfident) setProgress(db, key, { status: 'confident' }, now);
  return { suggestConfident };
}

export function renderPlan(db, limit = 10) {
  const lines = ['# Prep plan', ''];
  const top = listTopics(db, { limit });
  if (!top.length) lines.push('_No topics yet. Evaluate and shortlist jobs first._');
  for (const t of top) {
    const box = t.status === 'confident' ? '[x]' : '[ ]';
    lines.push(`- ${box} **${t.label}** (${t.status}, weight ${t.weight.toFixed(2)}) - wanted by ${t.jobs.length} job(s): ${t.jobs.slice(0, 5).join(', ')}`);
  }
  return lines.join('\n') + '\n';
}

export function writePlan(db, file = path.join('data', 'prep', 'plan.md'), limit = 10) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderPlan(db, limit));
  return file;
}
