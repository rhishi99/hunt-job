import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/core/db.js';
import { latestEvaluation, confirmApplyBelowThreshold, evaluationSnapshot } from '../src/cli/flows/applyGate.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});
afterEach(() => db.close());

function addEval(id, jobId, url, score, rec, at = '2026-09-01T00:00:00.000Z') {
  db.prepare(
    `INSERT INTO evaluations (id, url, evaluation, evaluated_at, job_id, score, recommendation)
     VALUES (?, ?, '{}', ?, ?, ?, ?)`
  ).run(id, url, at, jobId, score, rec);
}

describe('latestEvaluation', () => {
  test('matches by job id, newest first', () => {
    addEval('e1', 'j1', null, 2.0, 'Skip', '2026-09-01T00:00:00.000Z');
    addEval('e2', 'j1', null, 4.4, 'Apply', '2026-09-02T00:00:00.000Z');
    expect(latestEvaluation(db, { id: 'j1' })).toEqual({ id: 'e2', score: 4.4, recommendation: 'Apply' });
  });
  test('matches by url; null when nothing stored', () => {
    addEval('e1', null, 'https://x.com/j', 3.1, 'Maybe');
    expect(latestEvaluation(db, { url: 'https://x.com/j' }).score).toBe(3.1);
    expect(latestEvaluation(db, { id: 'nope' })).toBeNull();
    expect(latestEvaluation(db, {})).toBeNull();
  });
});

describe('B-21 confirmApplyBelowThreshold', () => {
  test('below threshold -> asks, and honours the answer', async () => {
    addEval('e1', 'j1', null, 3.2, 'Maybe');
    const yes = vi.fn(async () => true);
    const no = vi.fn(async () => false);
    expect(await confirmApplyBelowThreshold(db, { id: 'j1' }, '', 4.0, { confirm: yes })).toBe(true);
    expect(await confirmApplyBelowThreshold(db, { id: 'j1' }, '', 4.0, { confirm: no })).toBe(false);
    expect(yes.mock.calls[0][0]).toMatch(/3\.2.*below.*4\.0/);
  });
  test('at/above threshold or un-evaluated -> proceeds without prompting', async () => {
    addEval('e1', 'j1', null, 4.0, 'Apply');
    const confirm = vi.fn(async () => false);
    expect(await confirmApplyBelowThreshold(db, { id: 'j1' }, '', 4.0, { confirm })).toBe(true);
    expect(await confirmApplyBelowThreshold(db, { id: 'zzz' }, '', 4.0, { confirm })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('B-17 evaluationSnapshot', () => {
  test('snapshots score + recommendation and bumps attempt', () => {
    addEval('e1', 'j1', null, 4.5, 'Apply');
    expect(evaluationSnapshot(db, { id: 'j1' })).toEqual({
      jobId: 'j1', attempt: 1, evaluationId: 'e1', evaluationScore: 4.5, recommendation: 'Apply',
    });
    db.prepare(`INSERT INTO applications (id, job_id, attempt) VALUES ('a1', 'j1', 1)`).run();
    expect(evaluationSnapshot(db, { id: 'j1' }).attempt).toBe(2);
  });
  test('no evaluation -> nulls, still insertable', () => {
    const s = evaluationSnapshot(db, { url: 'https://x.com/none' });
    expect(s).toMatchObject({ jobId: null, attempt: 1, evaluationScore: null, recommendation: null });
  });
});
