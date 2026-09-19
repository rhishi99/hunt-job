// Durable task queue — docs/fable51-answers.md §1.3.
//
// `tasks` (migration v5, src/core/db.js) is the single work queue for the
// autonomous loop: evaluate / tailor / prep / hydrate / inbox all flow through
// it. Every function here takes `db` as an explicit first param, same
// convention as ./states.js and ./identity.js — no getDb() import, so this
// module is trivially testable against an in-memory database and has no
// import-cycle risk with db.js.
//
// Idempotency: `key` is UNIQUE on `tasks`. enqueue() is a no-op (returns the
// existing row) when the key already exists — callers are expected to pass
// `kind:job_id:content_hash:profile_hash` (§0.1) so a re-scan of an unchanged
// posting can never double-enqueue work, while a changed JD (new content_hash)
// enqueues on purpose.

const QUOTA_ERROR_CLASSES = new Set(['daily_quota', 'rate_limit']);

function nextLocalMidnightMs(now) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

function getTask(db, id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

/**
 * Idempotent insert on `key`. Returns the existing row unchanged if `key` is
 * already present (queued, running, done, failed or blocked — enqueue never
 * resurrects or re-prioritizes an existing task; callers that want that
 * enqueue under a new key instead, e.g. a new content_hash).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} kind - 'evaluate' | 'tailor' | 'prep' | 'hydrate' | 'inbox'
 * @param {string|null} jobId
 * @param {object|null} payload - JSON-serializable
 * @param {{key?: string, priority?: number, notBefore?: number}} [opts]
 */
export function enqueue(db, kind, jobId, payload = null, opts = {}) {
  if (!kind) throw new Error('enqueue: kind is required');
  const key = opts.key || `${kind}:${jobId ?? 'none'}`;
  const priority = opts.priority ?? 0;
  const notBefore = opts.notBefore ?? 0;
  const now = Date.now();

  const existing = db.prepare('SELECT * FROM tasks WHERE key = ?').get(key);
  if (existing) return existing;

  const info = db
    .prepare(
      `INSERT INTO tasks (kind, job_id, key, priority, not_before, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(kind, jobId ?? null, key, priority, notBefore, payload == null ? null : JSON.stringify(payload), now);

  return getTask(db, info.lastInsertRowid);
}

/**
 * Atomically claims the highest-priority runnable task (queued, not_before <=
 * now), marking it 'running' and bumping `attempts`. A single UPDATE ...
 * RETURNING keeps this safe for the scheduled task and a manual run to race
 * on (better-sqlite3 12 bundles SQLite >= 3.45). Returns null when nothing is
 * runnable.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{now?: number, excludeKinds?: string[]}} [opts] - excludeKinds lets
 *   the runner skip kinds it already knows are budget-exhausted this drain,
 *   without looping through them one claim at a time.
 */
export function claim(db, { now = Date.now(), excludeKinds = [] } = {}) {
  if (excludeKinds.length === 0) {
    return (
      db
        .prepare(
          `UPDATE tasks SET state = 'running', started_at = ?, attempts = attempts + 1
           WHERE id = (
             SELECT id FROM tasks WHERE state = 'queued' AND not_before <= ?
             ORDER BY priority DESC, id ASC LIMIT 1
           )
           RETURNING *`
        )
        .get(now, now) ?? null
    );
  }

  const placeholders = excludeKinds.map(() => '?').join(',');
  return (
    db
      .prepare(
        `UPDATE tasks SET state = 'running', started_at = ?, attempts = attempts + 1
         WHERE id = (
           SELECT id FROM tasks WHERE state = 'queued' AND not_before <= ? AND kind NOT IN (${placeholders})
           ORDER BY priority DESC, id ASC LIMIT 1
         )
         RETURNING *`
      )
      .get(now, now, ...excludeKinds) ?? null
  );
}

/** Marks a running task done. */
export function complete(db, taskId, { now = Date.now() } = {}) {
  db.prepare(`UPDATE tasks SET state = 'done', finished_at = ? WHERE id = ?`).run(now, taskId);
  return getTask(db, taskId);
}

/**
 * Reports a task failure. `errorClass` drives the outcome (§1.3, §1.7):
 *  - 'daily_quota'  -> parked back to 'queued' with not_before = next local
 *                      midnight. Not counted as a failure (§1.4 budget.js).
 *  - 'rate_limit'   -> parked back to 'queued' with a short cooldown. Also
 *                      not counted as a failure.
 *  - anything else  -> genuine failure. `attempts` was already bumped by
 *                      claim(); at `maxAttempts` the task goes 'blocked',
 *                      otherwise it's requeued with exponential backoff.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} taskId
 * @param {{errorClass?: string, message?: string, maxAttempts?: number, now?: number}} [opts]
 */
export function fail(db, taskId, { errorClass = null, message = null, maxAttempts = 3, now = Date.now() } = {}) {
  const task = getTask(db, taskId);
  if (!task) throw new Error(`fail: no task with id ${taskId}`);

  if (errorClass === 'daily_quota') {
    db.prepare(`UPDATE tasks SET state = 'queued', not_before = ?, last_error = ? WHERE id = ?`).run(
      nextLocalMidnightMs(now),
      message ?? errorClass,
      taskId
    );
    return getTask(db, taskId);
  }

  if (errorClass === 'rate_limit') {
    db.prepare(`UPDATE tasks SET state = 'queued', not_before = ?, last_error = ? WHERE id = ?`).run(
      now + 60_000,
      message ?? errorClass,
      taskId
    );
    return getTask(db, taskId);
  }

  if (task.attempts >= maxAttempts) {
    db.prepare(`UPDATE tasks SET state = 'blocked', last_error = ?, finished_at = ? WHERE id = ?`).run(
      message,
      now,
      taskId
    );
  } else {
    const backoffMs = Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, task.attempts - 1)); // 1m, 2m, 4m, ...
    db.prepare(`UPDATE tasks SET state = 'queued', not_before = ?, last_error = ? WHERE id = ?`).run(
      now + backoffMs,
      message,
      taskId
    );
  }
  return getTask(db, taskId);
}

/**
 * Recovers tasks orphaned by a killed process: any 'running' task whose
 * started_at is older than `staleMs` (default 20 min, §1.3) goes back to
 * 'queued' with attempts untouched — handlers are expected to be idempotent
 * via the same UNIQUE keys their writes use.
 */
export function releaseStale(db, { staleMs = 20 * 60_000, now = Date.now() } = {}) {
  const cutoff = now - staleMs;
  const info = db
    .prepare(`UPDATE tasks SET state = 'queued' WHERE state = 'running' AND started_at <= ?`)
    .run(cutoff);
  return info.changes;
}

export { QUOTA_ERROR_CLASSES };
