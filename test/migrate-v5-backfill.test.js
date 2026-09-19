import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/core/db.js';
import { runBackfill, resolveOrCreateJobForUrl, resolveOrCreateJobForText } from '../scripts/migrate-v5-backfill.js';

// Fixture mirrors the shape of the real legacy data (measured 2026-09-19):
// two evaluations of the identical URL (a re-evaluation), one pasted-text
// evaluation, and one application for the URL-evaluated job plus a
// check-then-insert race duplicate 4 minutes later.
function seededDb() {
  const db = new Database(':memory:');
  runMigrations(db);

  db.prepare(`
    INSERT INTO evaluations (id, url, evaluation, evaluated_at)
    VALUES (?, ?, ?, ?)
  `).run('eval_1', 'https://jobs.lever.co/acme/abc', JSON.stringify({ overallScore: 4.2, recommendation: 'Apply' }), '2026-01-01T00:00:00.000Z');
  db.prepare(`
    INSERT INTO evaluations (id, url, evaluation, evaluated_at)
    VALUES (?, ?, ?, ?)
  `).run('eval_2', 'https://jobs.lever.co/acme/abc', JSON.stringify({ overallScore: 4.2, recommendation: 'Apply' }), '2026-01-01T00:01:00.000Z');
  db.prepare(`
    INSERT INTO evaluations (id, url, evaluation, evaluated_at)
    VALUES (?, ?, ?, ?)
  `).run('eval_3', 'Position: SWE\nCompany: Beta\n\nPasted JD text.', JSON.stringify({ overallScore: 3.5, recommendation: 'Maybe' }), '2026-01-02T00:00:00.000Z');

  db.prepare(`INSERT INTO applications (id, title, company, url, applied_at) VALUES (?, ?, ?, ?, ?)`).run(
    'app_1', 'SWE', 'Acme', 'https://jobs.lever.co/acme/abc', '2026-01-01T00:01:05.000Z'
  );
  db.prepare(`INSERT INTO applications (id, title, company, url, applied_at) VALUES (?, ?, ?, ?, ?)`).run(
    'app_2', 'SWE', 'Acme', 'https://jobs.lever.co/acme/abc', '2026-01-01T00:04:00.000Z' // race dupe, 3 min later
  );

  return db;
}

describe('resolveOrCreateJobForUrl / resolveOrCreateJobForText', () => {
  test('creates a stub manual: row for a URL with no matching jobs row (no network)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const summary = { jobsCreated: [] };
    const id = resolveOrCreateJobForUrl(db, 'https://jobs.lever.co/acme/xyz', summary);
    expect(id).toMatch(/^manual:jobs\.lever\.co:[0-9a-f]{16}$/);
    expect(summary.jobsCreated).toEqual([id]);
    const row = db.prepare('SELECT description_state FROM jobs WHERE id = ?').get(id);
    expect(row.description_state).toBe('stub');
  });

  test('reuses an existing jobs row by canonical_url instead of creating a duplicate', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.prepare(`
      INSERT INTO jobs (id, company_id, ats_platform, title, url, canonical_url, first_seen_at, last_seen_at)
      VALUES ('greenhouse:acme:1', 'acme', 'greenhouse', 'SWE', 'https://boards.greenhouse.io/acme/jobs/1', 'https://boards.greenhouse.io/acme/jobs/1', 0, 0)
    `).run();
    const summary = { jobsCreated: [] };
    const id = resolveOrCreateJobForUrl(db, 'https://boards.greenhouse.io/acme/jobs/1', summary);
    expect(id).toBe('greenhouse:acme:1');
    expect(summary.jobsCreated).toEqual([]);
  });

  test('resolveOrCreateJobForText creates a full-text manual:text: row', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const summary = { jobsCreated: [] };
    const id = resolveOrCreateJobForText(db, 'Position: SWE\nCompany: Beta\n\nPasted JD text.', summary);
    expect(id).toMatch(/^manual:text:[0-9a-f]{16}$/);
    const row = db.prepare('SELECT title, description_state FROM jobs WHERE id = ?').get(id);
    expect(row.title).toBe('SWE');
    expect(row.description_state).toBe('full');
  });
});

describe('runBackfill on a fixture DB', () => {
  let db;
  beforeEach(() => {
    db = seededDb();
  });

  test('dry-run reports counts but persists nothing', () => {
    const summary = runBackfill(db, { dryRun: true });
    expect(summary.evaluationsUpdated).toHaveLength(3);
    expect(summary.applicationsUpdated).toHaveLength(1);
    expect(summary.applicationsDeleted).toHaveLength(1);
    expect(summary.pipelineRowsCreated).toHaveLength(1);

    // rolled back — nothing actually changed
    expect(db.prepare('SELECT job_id FROM evaluations WHERE id = ?').get('eval_1').job_id).toBeNull();
    expect(db.prepare('SELECT count(*) c FROM applications').get().c).toBe(2);
    expect(db.prepare('SELECT count(*) c FROM pipeline').get().c).toBe(0);
  });

  test('real run sets job_id/content_hash on every evaluation, keeping all rows', () => {
    runBackfill(db, { dryRun: false });
    const rows = db.prepare('SELECT id, job_id, content_hash, profile_hash, score, score_version, recommendation FROM evaluations ORDER BY id').all();
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.job_id).toBeTruthy();
      expect(r.content_hash).toBeTruthy();
      expect(r.profile_hash).toBe('legacy');
      expect(r.score_version).toBe(0);
    }
    // eval_1 and eval_2 are the same job (same URL)
    expect(rows.find(r => r.id === 'eval_1').job_id).toBe(rows.find(r => r.id === 'eval_2').job_id);
    // exact duplicate content -> distinguishable content_hash so the UNIQUE index holds
    expect(rows.find(r => r.id === 'eval_1').content_hash).not.toBe(rows.find(r => r.id === 'eval_2').content_hash);
    expect(rows.find(r => r.id === 'eval_3').score).toBe(3.5);
    expect(rows.find(r => r.id === 'eval_3').recommendation).toBe('Maybe');
  });

  test('unique index on evaluations survives the backfill (no constraint violation)', () => {
    expect(() => runBackfill(db, { dryRun: false })).not.toThrow();
  });

  test('deletes the check-then-insert race duplicate, keeps the first as attempt=1', () => {
    runBackfill(db, { dryRun: false });
    const apps = db.prepare('SELECT id, job_id, attempt FROM applications').all();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe('app_1');
    expect(apps[0].attempt).toBe(1);
    expect(apps[0].job_id).toBeTruthy();
  });

  test('creates a pipeline row in applied for the surviving application', () => {
    runBackfill(db, { dryRun: false });
    const app = db.prepare('SELECT job_id FROM applications WHERE id = ?').get('app_1');
    const pipeline = db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get(app.job_id);
    expect(pipeline.state).toBe('applied');
    const events = db.prepare('SELECT to_state FROM pipeline_events WHERE job_id = ? ORDER BY id').all(app.job_id);
    expect(events.map(e => e.to_state)).toEqual(['discovered', 'queued', 'evaluated', 'shortlisted', 'applying', 'applied']);
  });

  test('is idempotent: running twice does not throw and does not re-drive the pipeline', () => {
    runBackfill(db, { dryRun: false });
    expect(() => runBackfill(db, { dryRun: false })).not.toThrow();
    const app = db.prepare('SELECT job_id FROM applications WHERE id = ?').get('app_1');
    const events = db.prepare('SELECT count(*) c FROM pipeline_events WHERE job_id = ?').get(app.job_id);
    expect(events.c).toBe(6); // unchanged from the first run
  });
});
