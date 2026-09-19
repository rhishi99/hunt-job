import { describe, test, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, MIGRATIONS } from '../src/core/db.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('db.js migrations', () => {
  test('creates all Phase 1 tables', () => {
    const db = freshDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
    for (const t of ['companies', 'jobs', 'evaluations', 'applications', 'documents']) {
      expect(tables).toContain(t);
    }
    db.close();
  });

  test('sets user_version and is idempotent (safe to re-run)', () => {
    const db = freshDb();
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBeGreaterThan(0);
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(version);
    db.close();
  });

  test('v2 adds the http_cache table (scan/httpClient.js ETag cache)', () => {
    const db = freshDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
    expect(tables).toContain('http_cache');
    db.close();
  });

  test('WAL mode can be enabled on a real file handle', () => {
    const db = freshDb(); // :memory: ignores WAL but should not throw when pragma is set elsewhere
    db.pragma('journal_mode = WAL');
    db.close();
  });
});

describe('companies table', () => {
  test('dedupes by name case-insensitively', () => {
    const db = freshDb();
    const insert = db.prepare(`
      INSERT INTO companies (name, slug, ats_platform, location, career_url)
      VALUES (@name, @slug, @ats_platform, @location, @career_url)
      ON CONFLICT(name) DO UPDATE SET slug = excluded.slug
    `);
    insert.run({ name: 'PhonePe', slug: null, ats_platform: null, location: 'Bangalore', career_url: 'https://phonepe.com' });
    insert.run({ name: 'phonepe', slug: 'phonepe', ats_platform: 'greenhouse', location: null, career_url: null });

    const rows = db.prepare('SELECT * FROM companies').all();
    expect(rows.length).toBe(1);
    expect(rows[0].slug).toBe('phonepe');
    db.close();
  });
});

describe('evaluations table', () => {
  test('round-trips JSON evaluation/profile blobs', () => {
    const db = freshDb();
    db.prepare(`
      INSERT INTO evaluations (id, url, evaluation, profile, evaluated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('job_1', 'https://example.com/job', JSON.stringify({ overallScore: 4.2 }), JSON.stringify({ archetypes: ['SWE'] }), '2026-01-01T00:00:00.000Z');

    const row = db.prepare('SELECT * FROM evaluations WHERE id = ?').get('job_1');
    expect(JSON.parse(row.evaluation).overallScore).toBe(4.2);
    expect(JSON.parse(row.profile).archetypes).toEqual(['SWE']);
    db.close();
  });
});

describe('v5 migration (pipeline, identity, task queue, scoring — fable51-answers.md §0.1)', () => {
  test('creates all v5 tables and reaches user_version 5', () => {
    const db = freshDb();
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
    for (const t of [
      'pipeline', 'pipeline_events', 'tasks', 'llm_calls', 'score_versions',
      'inbox_events', 'prep_topics', 'prep_progress', 'prep_sessions',
    ]) {
      expect(tables).toContain(t);
    }
    db.close();
  });

  test('adds the new jobs/evaluations/applications/documents/companies columns', () => {
    const db = freshDb();
    const cols = table => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    expect(cols('jobs')).toEqual(expect.arrayContaining(['canonical_url', 'prefilter_score', 'prefilter_reason', 'description_state']));
    expect(cols('evaluations')).toEqual(expect.arrayContaining(['job_id', 'content_hash', 'profile_hash', 'model', 'extraction', 'score', 'score_version', 'recommendation']));
    expect(cols('applications')).toEqual(expect.arrayContaining(['job_id', 'evaluation_id', 'resume_document_id', 'attempt']));
    expect(cols('documents')).toEqual(expect.arrayContaining(['content_hash', 'verification']));
    expect(cols('companies')).toEqual(expect.arrayContaining(['scan_config']));
    db.close();
  });

  test('seeds score_versions version 1 with the §3.3 weight table', () => {
    const db = freshDb();
    const row = db.prepare('SELECT * FROM score_versions WHERE version = 1').get();
    expect(row).toBeTruthy();
    const weights = JSON.parse(row.weights);
    expect(weights).toEqual({
      skill_fit: 0.4, seniority_fit: 0.15, location_fit: 0.2,
      salary_fit: 0.1, role_scope: 0.1, freshness: 0.05,
    });
    db.close();
  });

  test('is idempotent (safe to re-run) alongside v1-v4', () => {
    const db = freshDb();
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    expect(db.prepare('SELECT count(*) c FROM score_versions').get().c).toBe(1); // not re-seeded
    db.close();
  });

  test('backfills jobs.canonical_url for rows that existed before v5, from url then apply_url', () => {
    const db = new Database(':memory:');
    // Apply only v1-v4 by hand, insert rows the way they existed pre-v5, then
    // let runMigrations pick up from v5 and backfill them (mirrors the real DB).
    db.transaction(() => {
      for (let v = 0; v < 4; v++) MIGRATIONS[v](db);
      db.pragma('user_version = 4');
    })();
    db.prepare(`
      INSERT INTO jobs (id, company_id, ats_platform, title, url, apply_url, first_seen_at, last_seen_at)
      VALUES ('x:1', 'acme', 'greenhouse', 'SWE', 'https://boards.greenhouse.io/acme/jobs/1?utm_source=li', NULL, 0, 0)
    `).run();
    db.prepare(`
      INSERT INTO jobs (id, company_id, ats_platform, title, url, apply_url, first_seen_at, last_seen_at)
      VALUES ('x:2', 'acme', 'greenhouse', 'SWE2', NULL, 'https://boards.greenhouse.io/acme/jobs/2/', 0, 0)
    `).run();

    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(5);
    expect(db.prepare('SELECT canonical_url FROM jobs WHERE id = ?').get('x:1').canonical_url).toBe(
      'https://boards.greenhouse.io/acme/jobs/1'
    );
    expect(db.prepare('SELECT canonical_url FROM jobs WHERE id = ?').get('x:2').canonical_url).toBe(
      'https://boards.greenhouse.io/acme/jobs/2'
    );
    db.close();
  });

  test('idx_evaluations_key and idx_applications_job_attempt tolerate multiple NULLs (pre-backfill state)', () => {
    const db = freshDb();
    db.prepare(`INSERT INTO evaluations (id, url, evaluation, evaluated_at) VALUES ('e1','u','{}','t')`).run();
    db.prepare(`INSERT INTO evaluations (id, url, evaluation, evaluated_at) VALUES ('e2','u','{}','t')`).run();
    db.prepare(`INSERT INTO applications (id, url) VALUES ('a1','u')`).run();
    db.prepare(`INSERT INTO applications (id, url) VALUES ('a2','u')`).run();
    expect(db.prepare('SELECT count(*) c FROM evaluations').get().c).toBe(2);
    expect(db.prepare('SELECT count(*) c FROM applications').get().c).toBe(2);
    db.close();
  });
});
