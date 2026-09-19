import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { enqueue, claim } from '../../src/core/pipeline/queue.js';
import { record } from '../../src/core/pipeline/budget.js';

const getActiveProviderName = vi.fn(() => 'anthropic');
vi.mock('../../src/core/aiClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getActiveProviderName: () => getActiveProviderName() };
});

let drain;
beforeEach(async () => {
  vi.resetModules();
  getActiveProviderName.mockReturnValue('anthropic');
  ({ drain } = await import('../../src/core/pipeline/runner.js'));
});
afterEach(() => vi.clearAllMocks());

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('drain — no work', () => {
  test('stops immediately with stopReason no_work on an empty queue', async () => {
    const db = freshDb();
    const summary = await drain({ db });
    expect(summary).toMatchObject({ claimed: 0, completed: 0, stopReason: 'no_work' });
  });
});

describe('drain — happy path', () => {
  test('dispatches to the handler for the task kind and completes it', async () => {
    const db = freshDb();
    enqueue(db, 'evaluate', 'job:1', { jd: 'text' });
    const handler = vi.fn(async () => {});

    const summary = await drain({ db, handlers: { evaluate: handler } });

    expect(handler).toHaveBeenCalledTimes(1);
    const [{ task }] = handler.mock.calls[0];
    expect(task.job_id).toBe('job:1');
    expect(task.payload).toEqual({ jd: 'text' }); // parsed from JSON, not the raw string
    expect(summary).toMatchObject({ claimed: 1, completed: 1, stopReason: 'no_work' });
    expect(db.prepare('SELECT state FROM tasks').get().state).toBe('done');
  });

  test('falls back to the noop handler for an unregistered kind', async () => {
    const db = freshDb();
    enqueue(db, 'hydrate', 'job:1', {});
    const summary = await drain({ db });
    expect(summary.completed).toBe(1);
  });
});

describe('drain — maxTasks', () => {
  test('stops after maxTasks even with more work queued', async () => {
    const db = freshDb();
    enqueue(db, 'evaluate', 'job:1', {}, { key: 'k1' });
    enqueue(db, 'evaluate', 'job:2', {}, { key: 'k2' });
    const summary = await drain({ db, maxTasks: 1, handlers: { evaluate: async () => {} } });
    expect(summary).toMatchObject({ claimed: 1, stopReason: 'max_tasks' });
    expect(db.prepare(`SELECT COUNT(*) c FROM tasks WHERE state='queued'`).get().c).toBe(1);
  });
});

describe('drain — failures', () => {
  test('a genuine handler error fails the task with backoff, not blocked on the first try', async () => {
    const db = freshDb();
    enqueue(db, 'evaluate', 'job:1', {});
    const handler = vi.fn(async () => { throw new Error('boom'); });

    const summary = await drain({ db, handlers: { evaluate: handler } });

    expect(summary).toMatchObject({ claimed: 1, failed: 1, completed: 0 });
    const task = db.prepare('SELECT * FROM tasks').get();
    expect(task.state).toBe('queued');
    expect(task.last_error).toBe('boom');
  });

  test('repeated genuine failures eventually block the task and stop counting as "failed" once blocked', async () => {
    const db = freshDb();
    const task = enqueue(db, 'evaluate', 'job:1', {});
    const handler = vi.fn(async () => { throw new Error('boom'); });

    // Run drain 3 times (each drain claims once then stops on no_work because
    // fail() sets a future not_before) to walk attempts 1 -> 2 -> 3(=maxAttempts default).
    let last;
    for (let i = 0; i < 3; i++) {
      last = await drain({ db, handlers: { evaluate: handler }, now: i * 1_000_000 });
    }
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
    expect(row.state).toBe('blocked');
    expect(last.blocked).toBe(1);
    expect(last.failed).toBe(0);
  });

  test('a handler that throws with errorClass daily_quota defers the task and excludes the kind for the rest of this drain', async () => {
    const db = freshDb();
    enqueue(db, 'evaluate', 'job:1', {}, { key: 'k1' });
    enqueue(db, 'evaluate', 'job:2', {}, { key: 'k2' });
    enqueue(db, 'tailor', 'job:3', {}, { key: 'k3' });

    const handler = vi.fn(async () => {
      const err = new Error('quota');
      err.errorClass = 'daily_quota';
      throw err;
    });
    const tailorHandler = vi.fn(async () => {});

    const summary = await drain({ db, handlers: { evaluate: handler, tailor: tailorHandler } });

    // Only the first evaluate task is even attempted — the second is excluded
    // once its kind is known to be quota-exhausted this drain.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(tailorHandler).toHaveBeenCalledTimes(1);
    expect(summary.deferred).toBe(1);
    expect(summary.completed).toBe(1);
    const evalTasks = db.prepare(`SELECT * FROM tasks WHERE kind = 'evaluate'`).all();
    expect(evalTasks.every(t => t.state === 'queued')).toBe(true);
  });
});

describe('drain — budget exhaustion (pre-flight, no handler call)', () => {
  test('a task whose kind already hit its daily cap is deferred without ever calling the handler', async () => {
    const db = freshDb();
    const now = Date.parse('2026-09-19T12:00:00Z');
    for (let i = 0; i < 150; i++) record(db, { provider: 'anthropic', taskKind: 'evaluate', ok: true, at: now });
    enqueue(db, 'evaluate', 'job:1', {});
    const handler = vi.fn(async () => {});

    const summary = await drain({ db, handlers: { evaluate: handler }, now });

    expect(handler).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ claimed: 1, deferred: 1, stopReason: 'budget_exhausted' });
  });
});

describe('drain — provider cooldown', () => {
  test('stops with providers_cooling_down without claiming anything, when every provider is unhealthy', async () => {
    getActiveProviderName.mockReturnValue(null);
    const db = freshDb();
    enqueue(db, 'evaluate', 'job:1', {});

    const summary = await drain({ db });

    expect(summary).toMatchObject({ claimed: 0, stopReason: 'providers_cooling_down' });
    expect(claim(db)).not.toBeNull(); // task was never touched
  });
});
