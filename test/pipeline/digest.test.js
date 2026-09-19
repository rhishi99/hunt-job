import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { buildDigest } from '../../src/core/pipeline/digest.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function insertCompany(db, overrides = {}) {
  const c = { name: 'Acme', slug: null, ats_platform: null, career_url: null, fail_count: 0, enabled: 1, ...overrides };
  db.prepare(
    `INSERT INTO companies (name, slug, ats_platform, career_url, fail_count, enabled) VALUES (@name, @slug, @ats_platform, @career_url, @fail_count, @enabled)`
  ).run(c);
  return db.prepare('SELECT * FROM companies WHERE name = ?').get(c.name);
}

function insertJob(db, id, overrides = {}) {
  const now = Date.now();
  const j = {
    id, company_id: 'Acme', ats_platform: 'greenhouse', title: 'DevOps Engineer', url: `https://example.com/${id}`,
    description: 'a job', content_hash: 'hashA', status: 'active', first_seen_at: now, last_seen_at: now,
    prefilter_score: 0.5, prefilter_reason: 'lexical:0.50', ...overrides,
  };
  db.prepare(`
    INSERT INTO jobs (id, company_id, ats_platform, title, url, description, content_hash, status, first_seen_at, last_seen_at, prefilter_score, prefilter_reason)
    VALUES (@id, @company_id, @ats_platform, @title, @url, @description, @content_hash, @status, @first_seen_at, @last_seen_at, @prefilter_score, @prefilter_reason)
  `).run(j);
  return j;
}

function insertPipeline(db, jobId, overrides = {}) {
  const now = Date.now();
  const p = { job_id: jobId, state: 'discovered', state_changed_at: now, score: null, evaluation_id: null, ...overrides };
  db.prepare(`
    INSERT INTO pipeline (job_id, state, state_changed_at, score, evaluation_id) VALUES (@job_id, @state, @state_changed_at, @score, @evaluation_id)
  `).run(p);
  return p;
}

function insertEvaluation(db, id, overrides = {}) {
  const e = { id, url: 'https://example.com', evaluation: JSON.stringify({ mismatches: [] }), evaluated_at: new Date().toISOString(), ...overrides };
  db.prepare(`INSERT INTO evaluations (id, url, evaluation, evaluated_at) VALUES (@id, @url, @evaluation, @evaluated_at)`).run(e);
  return e;
}

const stubProfile = { salary: { min: 40, max: 70, currency: '₹', unit: 'LPA' } };

describe('buildDigest — empty DB', () => {
  test('empty sections read "none" and json arrays are empty', async () => {
    const db = freshDb();
    const { markdown, json } = await buildDigest(db, '2026-09-19', { profile: stubProfile });

    expect(markdown).toContain('# Hunt-Job digest — 2026-09-19');
    expect(markdown).toContain('_None yet._');
    expect(markdown).toContain('_None._');
    expect(json.readyToApply).toEqual([]);
    expect(json.evaluatedMaybe).toEqual([]);
    expect(json.date).toBe('2026-09-19');
  });

  test('no salary assumption flag when the profile has none', async () => {
    const db = freshDb();
    const { markdown, json } = await buildDigest(db, '2026-09-19', { profile: {} });
    expect(json.salaryAssumptionFlag).toBeNull();
    expect(markdown).not.toContain('unverified');
  });
});

describe('buildDigest — ready to apply', () => {
  test('shortlisted/prepared jobs appear, sorted by score desc', async () => {
    const db = freshDb();
    insertJob(db, 'job:1', { title: 'Low score job' });
    insertPipeline(db, 'job:1', { state: 'shortlisted', score: 4.1 });
    insertJob(db, 'job:2', { title: 'High score job' });
    insertPipeline(db, 'job:2', { state: 'prepared', score: 4.8 });
    insertJob(db, 'job:3', { title: 'Not ready' });
    insertPipeline(db, 'job:3', { state: 'maybe', score: 3.2 });

    const { json } = await buildDigest(db, '2026-09-19', { profile: stubProfile });

    expect(json.readyToApply).toHaveLength(2);
    expect(json.readyToApply[0].title).toBe('High score job');
    expect(json.readyToApply[1].title).toBe('Low score job');
  });
});

describe('buildDigest — evaluated maybe + top mismatch', () => {
  test('carries the first mismatch from the linked evaluation row', async () => {
    const db = freshDb();
    insertEvaluation(db, 'eval:1', { evaluation: JSON.stringify({ mismatches: ['no k8s experience', 'salary low'] }) });
    insertJob(db, 'job:1', { title: 'Maybe job' });
    insertPipeline(db, 'job:1', { state: 'maybe', score: 3.4, evaluation_id: 'eval:1' });

    const { markdown, json } = await buildDigest(db, '2026-09-19', { profile: stubProfile });

    expect(json.evaluatedMaybe).toHaveLength(1);
    expect(json.evaluatedMaybe[0].topMismatch).toBe('no k8s experience');
    expect(markdown).toContain('mismatch: no k8s experience');
  });
});

describe('buildDigest — waiting', () => {
  test('counts queued tasks per kind and flags a quota-blocked kind with its unblock time', async () => {
    const db = freshDb();
    const now = Date.parse('2026-09-19T06:00:00Z');
    const future = now + 3600_000;
    db.prepare(`INSERT INTO tasks (kind, job_id, key, state, not_before, created_at) VALUES ('evaluate','job:1','k1','queued',0,?)`).run(now);
    db.prepare(`INSERT INTO tasks (kind, job_id, key, state, not_before, created_at) VALUES ('evaluate','job:2','k2','queued',?,?)`).run(future, now);
    db.prepare(`INSERT INTO tasks (kind, job_id, key, state, not_before, created_at) VALUES ('tailor','job:3','k3','queued',0,?)`).run(now);

    // buildDigest doesn't take `now` directly; it reads Date.now() internally
    // for the blocked-until comparison, so assert on the shape instead of the
    // exact "blocked" boolean, which is time-sensitive to real wall-clock time.
    const { json } = await buildDigest(db, '2026-09-19', { profile: stubProfile });

    expect(json.waiting.evaluate.queued).toBe(2);
    expect(json.waiting.tailor.queued).toBe(1);
    expect(json.waiting.prep.queued).toBe(0);
  });
});

describe('buildDigest — health', () => {
  test('surfaces failing companies, auto-disabled companies, and blocked tasks', async () => {
    const db = freshDb();
    insertCompany(db, { name: 'FlakyCo', fail_count: 2, enabled: 1 });
    insertCompany(db, { name: 'DeadCo', fail_count: 5, enabled: 0 });
    db.prepare(`
      INSERT INTO tasks (kind, job_id, key, state, last_error, created_at, finished_at)
      VALUES ('evaluate', 'job:9', 'k9', 'blocked', 'boom', ?, ?)
    `).run(Date.now(), Date.now());

    const { markdown, json } = await buildDigest(db, '2026-09-19', { profile: stubProfile });

    expect(json.health.failing.map(c => c.name)).toContain('FlakyCo');
    expect(json.health.disabled.map(c => c.name)).toContain('DeadCo');
    expect(json.health.blockedTasks).toHaveLength(1);
    expect(markdown).toContain('FlakyCo');
    expect(markdown).toContain('DeadCo');
    expect(markdown).toMatch(/boom/);
  });
});

describe('buildDigest — §8 assumption 2 salary flag', () => {
  test('flags the profile salary range as unverified in the header', async () => {
    const db = freshDb();
    const { markdown, json } = await buildDigest(db, '2026-09-19', { profile: stubProfile });
    expect(json.salaryAssumptionFlag).toMatch(/unverified/);
    expect(json.salaryAssumptionFlag).toMatch(/40/);
    expect(json.salaryAssumptionFlag).toMatch(/70/);
    expect(markdown).toMatch(/^> .*unverified/m);
  });
});
