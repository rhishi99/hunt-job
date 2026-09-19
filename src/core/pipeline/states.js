// Pipeline state machine — docs/fable51-answers.md §2.3.
//
// The transition table is data: [{ from, to, actors }]. `from: null` means
// "no pipeline row yet" — the job is entering the funnel for the first time.
// `transition()` is the only writer of `pipeline` / `pipeline_events`; the
// dashboard PATCH and the CLI apply-flow prompt both route through it so the
// graph can't be bypassed from two places with two different rules.

export const ACTORS = Object.freeze({
  PIPELINE: 'pipeline',
  SCAN: 'scan',
  INBOX: 'inbox',
  CLI: 'user:cli',
  DASHBOARD: 'user:dashboard',
});

export const STATES = Object.freeze([
  'discovered', 'filtered_out', 'queued', 'evaluated', 'skip', 'maybe',
  'shortlisted', 'prepared', 'applying', 'applied', 'acknowledged',
  'screening', 'interview', 'offer', 'rejected', 'expired', 'withdrawn',
  'archived',
]);

const PRE_APPLIED_STATES = ['discovered', 'queued', 'evaluated', 'skip', 'maybe', 'shortlisted', 'prepared'];
// Exported: run.js (brief 5) reuses this exact list to decide whether a
// changed JD (content_hash) should send an already-scored job back to
// 'queued' for re-evaluation, without duplicating the state list.
export const RE_EVALUATE_STATES = ['evaluated', 'maybe', 'shortlisted', 'prepared']; // JD content_hash changed
const POST_APPLIED_STATES = ['applied', 'acknowledged', 'screening', 'interview'];
const REOPEN_STATES = ['rejected', 'expired', 'withdrawn']; // re-apply after >= 90 days, same jobs.id

const USER = [ACTORS.CLI, ACTORS.DASHBOARD];
const INBOX_OR_USER = [ACTORS.INBOX, ...USER];

// Grouped rows from docs/fable51-answers.md §2.3, expanded to one {from,to} pair each.
const RULES = [
  { from: 'discovered', to: 'filtered_out', actors: [ACTORS.PIPELINE] },
  { from: 'discovered', to: 'queued', actors: [ACTORS.PIPELINE] },
  { from: 'queued', to: 'evaluated', actors: [ACTORS.PIPELINE] },
  { from: 'evaluated', to: 'skip', actors: [ACTORS.PIPELINE] },
  { from: 'evaluated', to: 'maybe', actors: [ACTORS.PIPELINE] },
  { from: 'evaluated', to: 'shortlisted', actors: [ACTORS.PIPELINE] },
  { from: 'shortlisted', to: 'prepared', actors: [ACTORS.PIPELINE] },
  { from: 'maybe', to: 'applying', actors: USER },
  { from: 'shortlisted', to: 'applying', actors: USER },
  { from: 'prepared', to: 'applying', actors: USER },
  { from: 'applying', to: 'applied', actors: USER },
  { from: 'applied', to: 'acknowledged', actors: INBOX_OR_USER },
  { from: 'acknowledged', to: 'screening', actors: INBOX_OR_USER },
  { from: 'screening', to: 'interview', actors: INBOX_OR_USER },
  { from: 'interview', to: 'offer', actors: INBOX_OR_USER },
  ...POST_APPLIED_STATES.map(from => ({ from, to: 'rejected', actors: INBOX_OR_USER })),
  ...PRE_APPLIED_STATES.map(from => ({ from, to: 'expired', actors: [ACTORS.SCAN] })),
  ...STATES.map(from => ({ from, to: 'withdrawn', actors: USER })),
  ...STATES.map(from => ({ from, to: 'archived', actors: USER })),
  ...REOPEN_STATES.map(from => ({ from, to: 'queued', actors: USER })),
  ...RE_EVALUATE_STATES.map(from => ({ from, to: 'queued', actors: [ACTORS.PIPELINE, ACTORS.SCAN] })),
  // First entry — no pipeline row exists yet for this job_id.
  { from: null, to: 'discovered', actors: [ACTORS.SCAN, ACTORS.PIPELINE] },
  { from: null, to: 'queued', actors: USER },
];

const RULE_MAP = new Map(RULES.map(r => [`${r.from}->${r.to}`, r]));

/** Pure check, no DB — used by tests and by anything that wants to pre-validate. */
export function isLegalTransition(from, to, actor) {
  const rule = RULE_MAP.get(`${from}->${to}`);
  return !!rule && rule.actors.includes(actor);
}

/**
 * Validates and applies a pipeline state transition in one SQLite transaction:
 * inserts the `pipeline` row on first entry (fromState === null), updates it
 * otherwise, and always appends an audit row to `pipeline_events`. Throws on
 * any transition not in the table above, or performed by an actor not
 * authorized for that specific edge.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} jobId
 * @param {string} toState
 * @param {{actor: string, reason?: string}} opts
 * @returns {object} the resulting `pipeline` row
 */
export function transition(db, jobId, toState, { actor, reason = null } = {}) {
  if (!jobId) throw new Error('transition: jobId is required');
  if (!STATES.includes(toState)) throw new Error(`transition: unknown state "${toState}"`);
  if (!actor) throw new Error('transition: actor is required');

  const run = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM pipeline WHERE job_id = ?').get(jobId);
    const fromState = existing ? existing.state : null;
    const rule = RULE_MAP.get(`${fromState}->${toState}`);
    if (!rule || !rule.actors.includes(actor)) {
      throw new Error(
        `illegal transition: ${fromState ?? '(none)'} -> ${toState} by actor "${actor}" for job ${jobId}`
      );
    }

    const now = Date.now();
    if (existing) {
      db.prepare('UPDATE pipeline SET state = ?, state_changed_at = ? WHERE job_id = ?').run(toState, now, jobId);
    } else {
      db.prepare('INSERT INTO pipeline (job_id, state, state_changed_at) VALUES (?, ?, ?)').run(jobId, toState, now);
    }
    db.prepare(`
      INSERT INTO pipeline_events (job_id, from_state, to_state, actor, reason, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jobId, fromState, toState, actor, reason, now);

    return db.prepare('SELECT * FROM pipeline WHERE job_id = ?').get(jobId);
  });

  return run();
}
