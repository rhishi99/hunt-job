import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { enqueue, claim, complete, fail, releaseStale } from '../../src/core/pipeline/queue.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('enqueue', () => {
  let db;
  beforeEach(() => { db = freshDb(); });

  test('inserts a new task with defaults', () => {
    const task = enqueue(db, 'evaluate', 'job:1', { foo: 'bar' });
    expect(task.kind).toBe('evaluate');
    expect(task.job_id).toBe('job:1');
    expect(task.state).toBe('queued');
    expect(task.priority).toBe(0);
    expect(task.attempts).toBe(0);
    expect(task.not_before).toBe(0);
    expect(JSON.parse(task.payload)).toEqual({ foo: 'bar' });
  });

  test('is idempotent on the default key (kind:job_id) — a second call is a no-op', () => {
    const first = enqueue(db, 'evaluate', 'job:1', { v: 1 });
    const second = enqueue(db, 'evaluate', 'job:1', { v: 2 });
    expect(second.id).toBe(first.id);
    expect(JSON.parse(second.payload)).toEqual({ v: 1 }); // unchanged — enqueue never updates an existing row
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get().c).toBe(1);
  });

  test('is idempotent on an explicit key (kind:job_id:content_hash:profile_hash)', () => {
    const key = 'evaluate:job:1:hashA:profileX';
    const first = enqueue(db, 'evaluate', 'job:1', {}, { key });
    const second = enqueue(db, 'evaluate', 'job:1', {}, { key });
    expect(second.id).toBe(first.id);
  });

  test('a changed content_hash (different key) enqueues a new task on purpose', () => {
    const a = enqueue(db, 'evaluate', 'job:1', {}, { key: 'evaluate:job:1:hashA:profileX' });
    const b = enqueue(db, 'evaluate', 'job:1', {}, { key: 'evaluate:job:1:hashB:profileX' });
    expect(b.id).not.toBe(a.id);
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get().c).toBe(2);
  });

  test('accepts a null job_id and null payload (digest-style tasks)', () => {
    const task = enqueue(db, 'digest', null, null);
    expect(task.job_id).toBeNull();
    expect(task.payload).toBeNull();
  });
});

describe('claim', () => {
  let db;
  beforeEach(() => { db = freshDb(); });

  test('returns null when nothing is queued', () => {
    expect(claim(db)).toBeNull();
  });

  test('claims highest priority first', () => {
    enqueue(db, 'evaluate', 'job:low', {}, { key: 'k:low', priority: 1 });
    enqueue(db, 'evaluate', 'job:high', {}, { key: 'k:high', priority: 99 });
    const claimed = claim(db);
    expect(claimed.job_id).toBe('job:high');
  });

  test('marks the task running and bumps attempts', () => {
    const task = enqueue(db, 'evaluate', 'job:1', {});
    const claimed = claim(db, { now: 1000 });
    expect(claimed.id).toBe(task.id);
    expect(claimed.state).toBe('running');
    expect(claimed.attempts).toBe(1);
    expect(claimed.started_at).toBe(1000);
  });

  test('a task with a future not_before is not runnable yet', () => {
    enqueue(db, 'evaluate', 'job:1', {}, { notBefore: 5000 });
    expect(claim(db, { now: 1000 })).toBeNull();
    const claimed = claim(db, { now: 5000 });
    expect(claimed.job_id).toBe('job:1');
  });

  test('excludeKinds skips a whole kind without touching not_before', () => {
    enqueue(db, 'evaluate', 'job:1', {}, { key: 'k:1' });
    enqueue(db, 'tailor', 'job:2', {}, { key: 'k:2' });
    const claimed = claim(db, { excludeKinds: ['evaluate'] });
    expect(claimed.kind).toBe('tailor');
  });

  test('two sequential claims never return the same task', () => {
    enqueue(db, 'evaluate', 'job:1', {}, { key: 'k:1' });
    enqueue(db, 'evaluate', 'job:2', {}, { key: 'k:2' });
    const first = claim(db);
    const second = claim(db);
    expect(first.id).not.toBe(second.id);
  });
});

describe('complete', () => {
  test('marks a task done with finished_at', () => {
    const db = freshDb();
    const task = enqueue(db, 'evaluate', 'job:1', {});
    claim(db);
    const done = complete(db, task.id, { now: 2000 });
    expect(done.state).toBe('done');
    expect(done.finished_at).toBe(2000);
  });
});

describe('fail', () => {
  let db;
  beforeEach(() => { db = freshDb(); });

  test('daily_quota parks the task back to queued at next local midnight, not a failure', () => {
    const task = enqueue(db, 'evaluate', 'job:1', {});
    claim(db);
    const now = new Date('2026-09-19T10:00:00').getTime();
    const outcome = fail(db, task.id, { errorClass: 'daily_quota', message: 'quota', now });
    expect(outcome.state).toBe('queued');
    const expectedMidnight = new Date('2026-09-20T00:00:00').getTime();
    expect(outcome.not_before).toBe(expectedMidnight);
  });

  test('rate_limit parks the task back to queued with a short cooldown, not a failure', () => {
    const task = enqueue(db, 'evaluate', 'job:1', {});
    claim(db);
    const now = 100_000;
    const outcome = fail(db, task.id, { errorClass: 'rate_limit', now });
    expect(outcome.state).toBe('queued');
    expect(outcome.not_before).toBe(now + 60_000);
  });

  test('a genuine failure below maxAttempts requeues with backoff', () => {
    const task = enqueue(db, 'evaluate', 'job:1', {});
    claim(db); // attempts -> 1
    const outcome = fail(db, task.id, { message: 'boom', now: 0, maxAttempts: 3 });
    expect(outcome.state).toBe('queued');
    expect(outcome.last_error).toBe('boom');
    expect(outcome.not_before).toBeGreaterThan(0);
  });

  test('reaching maxAttempts blocks the task', () => {
    let task = enqueue(db, 'evaluate', 'job:1', {});
    for (let i = 0; i < 3; i++) {
      claim(db, { now: i * 1_000_000 }); // clears not_before backoff each time
      task = fail(db, task.id, { message: `attempt ${i}`, now: i * 1_000_000, maxAttempts: 3 });
    }
    expect(task.state).toBe('blocked');
    expect(task.last_error).toBe('attempt 2');
  });

  test('throws for an unknown task id', () => {
    expect(() => fail(db, 999, {})).toThrow(/no task/);
  });
});

describe('releaseStale', () => {
  test('returns a stuck running task to queued, leaving a fresh one alone', () => {
    const db = freshDb();
    const stuck = enqueue(db, 'evaluate', 'job:stuck', {}, { key: 'k:stuck' });
    const fresh = enqueue(db, 'evaluate', 'job:fresh', {}, { key: 'k:fresh' });
    const now = Date.parse('2026-09-19T12:00:00Z');
    db.prepare(`UPDATE tasks SET state='running', started_at=? WHERE id=?`).run(now - 30 * 60_000, stuck.id);
    db.prepare(`UPDATE tasks SET state='running', started_at=? WHERE id=?`).run(now - 5 * 60_000, fresh.id);

    const changed = releaseStale(db, { staleMs: 20 * 60_000, now });

    expect(changed).toBe(1);
    expect(db.prepare('SELECT state FROM tasks WHERE id=?').get(stuck.id).state).toBe('queued');
    expect(db.prepare('SELECT state FROM tasks WHERE id=?').get(fresh.id).state).toBe('running');
  });
});
