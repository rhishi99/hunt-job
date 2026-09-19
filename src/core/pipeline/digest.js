// Morning digest — docs/fable51-answers.md §1.5, §8 assumption 2.
//
// buildDigest(db, date) is a pure READ over pipeline/jobs/evaluations/tasks/
// companies — it never mutates the DB, so it's safe to call on every `run`
// and to unit-test against a fixture DB with no live scan. `date` ('YYYY-MM-DD')
// is only the digest's own label/filename; the sections below are CURRENT
// pipeline-state snapshots, not "things that happened today" — a shortlisted
// job stays in "Ready to apply" until the user acts on it, not just on the
// day it was scored.
import ProfileManager from '../profileManager.js';

const MAYBE_FLOOR = 3.0; // §1.2: "Evaluated, maybe" = score 3.0-3.9

function fmtDateTime(ms) {
  if (!ms) return null;
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function readyToApply(db) {
  return db
    .prepare(
      `SELECT j.id AS jobId, j.title, j.url,
              COALESCE(j.employer, c.name, j.company_id) AS company,
              p.state, p.score,
              d1.file_path AS resumePath, d2.file_path AS prepPath
       FROM pipeline p
       JOIN jobs j ON j.id = p.job_id
       LEFT JOIN companies c ON c.id = j.company_id
       LEFT JOIN documents d1 ON d1.id = p.resume_document_id
       LEFT JOIN documents d2 ON d2.id = p.prep_document_id
       WHERE p.state IN ('shortlisted', 'prepared')
       ORDER BY p.score DESC`
    )
    .all();
}

function evaluatedMaybe(db) {
  return db
    .prepare(
      `SELECT j.id AS jobId, j.title, j.url,
              COALESCE(j.employer, c.name, j.company_id) AS company,
              p.score, p.evaluation_id
       FROM pipeline p
       JOIN jobs j ON j.id = p.job_id
       LEFT JOIN companies c ON c.id = j.company_id
       WHERE p.state = 'maybe'
       ORDER BY p.score DESC`
    )
    .all()
    .map(row => ({ ...row, topMismatch: topMismatch(db, row.evaluation_id) }));
}

function topMismatch(db, evaluationId) {
  if (!evaluationId) return null;
  const row = db.prepare('SELECT evaluation FROM evaluations WHERE id = ?').get(evaluationId);
  if (!row) return null;
  try {
    const ev = JSON.parse(row.evaluation);
    return Array.isArray(ev.mismatches) && ev.mismatches.length ? ev.mismatches[0] : null;
  } catch {
    return null;
  }
}

// Waiting: queued counts per LLM-consuming kind, plus whether any of that
// kind's queue is quota-parked (not_before in the future) and until when.
function waitingSummary(db, now) {
  const kinds = ['evaluate', 'tailor', 'prep'];
  const summary = {};
  for (const kind of kinds) {
    const queued = db.prepare(`SELECT COUNT(*) c FROM tasks WHERE kind = ? AND state = 'queued'`).get(kind).c;
    const until = db
      .prepare(`SELECT MAX(not_before) u FROM tasks WHERE kind = ? AND state = 'queued' AND not_before > ?`)
      .get(kind, now).u;
    summary[kind] = { queued, blockedUntil: until || null };
  }
  return summary;
}

function health(db) {
  const failing = db
    .prepare(`SELECT name, fail_count AS failCount FROM companies WHERE enabled = 1 AND fail_count > 0 ORDER BY fail_count DESC`)
    .all();
  const disabled = db.prepare(`SELECT name FROM companies WHERE enabled = 0 ORDER BY name`).all();
  const blockedTasks = db
    .prepare(`SELECT id, kind, job_id AS jobId, last_error AS lastError FROM tasks WHERE state = 'blocked' ORDER BY id DESC LIMIT 20`)
    .all();
  return { failing, disabled, blockedTasks };
}

/** §8 assumption 2: the profile's salary range is unverified — flag it until confirmed. */
function salaryAssumptionFlag(profile) {
  const salary = profile?.salary;
  if (!salary || (!salary.min && !salary.max)) return null;
  const unit = salary.unit || 'LPA';
  const currency = salary.currency || '₹';
  return (
    `Profile salary ${currency}${salary.min ?? '?'}-${currency}${salary.max ?? '?'} ${unit} is an unverified ` +
    `assumption (docs/fable51-answers.md §8, item 2) — flagged here until confirmed.`
  );
}

/**
 * Builds the morning digest (§1.5) as markdown + a JSON mirror.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} date - 'YYYY-MM-DD', used only as the digest's own label
 * @param {{profile?: object}} [opts] - `profile` override for tests; a real
 *   `run` loads it from config/profile.yml when omitted.
 * @returns {Promise<{markdown: string, json: object}>}
 */
export async function buildDigest(db, date, opts = {}) {
  const now = Date.now();
  const profile = opts.profile ?? (await new ProfileManager().loadProfile());

  const ready = readyToApply(db);
  const maybe = evaluatedMaybe(db);
  const waiting = waitingSummary(db, now);
  const h = health(db);
  const salaryFlag = salaryAssumptionFlag(profile);

  const lines = [`# Hunt-Job digest — ${date}`, ''];
  if (salaryFlag) lines.push(`> ⚠ ${salaryFlag}`, '');

  lines.push(`## Ready to apply (${ready.length})`);
  if (!ready.length) lines.push('_None yet._');
  for (const r of ready) {
    lines.push(`- **${r.title}** @ ${r.company || 'unknown company'} — score ${r.score ?? '?'} — ${r.url || 'no link'}`);
    if (r.resumePath) lines.push(`  - résumé: ${r.resumePath}`);
    if (r.prepPath) lines.push(`  - prep: ${r.prepPath}`);
  }
  lines.push('');

  lines.push(`## Evaluated, maybe (${maybe.length})`);
  if (!maybe.length) lines.push('_None._');
  for (const r of maybe) {
    const mismatch = r.topMismatch ? ` — mismatch: ${r.topMismatch}` : '';
    lines.push(`- **${r.title}** @ ${r.company || 'unknown company'} — score ${r.score ?? '?'}${mismatch} — ${r.url || 'no link'}`);
  }
  lines.push('');

  lines.push('## Waiting');
  for (const kind of Object.keys(waiting)) {
    const w = waiting[kind];
    const blockedNote = w.blockedUntil ? ` (blocked until ${fmtDateTime(w.blockedUntil)})` : '';
    lines.push(`- ${kind}: ${w.queued} queued${blockedNote}`);
  }
  lines.push('');

  lines.push('## Health');
  lines.push(`- Failing companies: ${h.failing.length ? h.failing.map(c => `${c.name} (${c.failCount})`).join(', ') : 'none'}`);
  lines.push(`- Auto-disabled companies: ${h.disabled.length ? h.disabled.map(c => c.name).join(', ') : 'none'}`);
  lines.push(
    `- Blocked tasks: ${h.blockedTasks.length ? h.blockedTasks.map(t => `#${t.id} ${t.kind} (${t.lastError || 'no reason'})`).join('; ') : 'none'}`
  );
  lines.push('');

  lines.push('## Inbox');
  lines.push('_Not available yet — auto-apply-outcome capture lands with T7._');

  const markdown = lines.join('\n');
  const json = {
    date,
    generatedAt: now,
    salaryAssumptionFlag: salaryFlag,
    readyToApply: ready,
    evaluatedMaybe: maybe,
    waiting,
    health: h,
  };

  return { markdown, json };
}

export { MAYBE_FLOOR };
