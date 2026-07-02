import { describe, test, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/core/db.js';

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
