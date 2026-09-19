import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { remaining, record, usedToday, isMetered, getBudgetConfig } from '../../src/core/pipeline/budget.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('getBudgetConfig / isMetered', () => {
  test('reads the daily caps checked into config/settings.json (§8 assumption 3 placeholders)', () => {
    const { daily, reserve } = getBudgetConfig();
    expect(daily).toEqual({ evaluate: 150, tailor: 25, prep: 25, inbox: 30 });
    expect(reserve).toBe(0.2);
  });

  test('evaluate/tailor/prep/inbox are metered, an unlisted kind like hydrate is not', () => {
    expect(isMetered('evaluate')).toBe(true);
    expect(isMetered('hydrate')).toBe(false);
  });
});

describe('record', () => {
  let db;
  beforeEach(() => { db = freshDb(); });

  test('writes an ok row', () => {
    const ok = record(db, { provider: 'anthropic', model: 'claude-x', taskKind: 'evaluate', ok: true, tokensIn: 100, tokensOut: 50, ms: 12 });
    expect(ok).toBe(true);
    const row = db.prepare('SELECT * FROM llm_calls').get();
    expect(row.provider).toBe('anthropic');
    expect(row.ok).toBe(1);
    expect(row.tokens_in).toBe(100);
  });

  test('writes a failed row with an error_class', () => {
    record(db, { provider: 'gemini', taskKind: 'evaluate', ok: false, errorClass: 'rate_limit' });
    const row = db.prepare('SELECT * FROM llm_calls').get();
    expect(row.ok).toBe(0);
    expect(row.error_class).toBe('rate_limit');
  });

  test('never throws — missing db or entry, or a broken db, all return false', () => {
    expect(record(null, { provider: 'a', taskKind: 'evaluate', ok: true })).toBe(false);
    expect(record(db, null)).toBe(false);
    expect(record(db, { provider: 'a', ok: true })).toBe(false); // no taskKind
    const brokenDb = { prepare: () => { throw new Error('no table'); } };
    expect(record(brokenDb, { provider: 'a', taskKind: 'evaluate', ok: true })).toBe(false);
  });
});

describe('usedToday / remaining', () => {
  let db;
  beforeEach(() => { db = freshDb(); });

  test('counts both ok and failed calls for a kind today', () => {
    const now = Date.parse('2026-09-19T12:00:00Z');
    record(db, { provider: 'a', taskKind: 'evaluate', ok: true, at: now });
    record(db, { provider: 'a', taskKind: 'evaluate', ok: false, errorClass: 'http', at: now });
    record(db, { provider: 'a', taskKind: 'tailor', ok: true, at: now }); // different kind
    expect(usedToday(db, 'evaluate', { now })).toBe(2);
  });

  test('excludes calls from a previous day', () => {
    const today = Date.parse('2026-09-19T12:00:00Z');
    const yesterday = today - DAY_MS;
    record(db, { provider: 'a', taskKind: 'evaluate', ok: true, at: yesterday });
    expect(usedToday(db, 'evaluate', { now: today })).toBe(0);
  });

  test('remaining = cap - used, floored at 0', () => {
    const now = Date.parse('2026-09-19T12:00:00Z');
    for (let i = 0; i < 3; i++) record(db, { provider: 'a', taskKind: 'tailor', ok: true, at: now });
    // tailor cap is 25 in the checked-in settings
    expect(remaining(db, 'tailor', { now })).toBe(22);
  });

  test('remaining never goes negative even if usage exceeds the cap', () => {
    const now = Date.parse('2026-09-19T12:00:00Z');
    for (let i = 0; i < 30; i++) record(db, { provider: 'a', taskKind: 'tailor', ok: true, at: now });
    expect(remaining(db, 'tailor', { now })).toBe(0);
  });

  test('an unmetered kind has infinite remaining budget', () => {
    expect(remaining(db, 'hydrate')).toBe(Infinity);
  });
});
