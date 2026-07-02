import { describe, test, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';

vi.mock('../../src/core/scan/providers/greenhouse.js', () => ({ fetchJobs: vi.fn() }));

import { fetchJobs as ghFetchJobs } from '../../src/core/scan/providers/greenhouse.js';
import { scanAll } from '../../src/core/scan/index.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function insertCompany(db, overrides = {}) {
  const c = { id: 1, name: 'GitLab', slug: 'gitlab', ats_platform: 'greenhouse', location: 'Remote-India', fail_count: 0, ...overrides };
  db.prepare(`
    INSERT INTO companies (id, name, slug, ats_platform, location, fail_count)
    VALUES (@id, @name, @slug, @ats_platform, @location, @fail_count)
  `).run(c);
  return c;
}

function job(overrides = {}) {
  return {
    id: 'greenhouse:gitlab:1', company: 'GitLab', title: 'Backend Engineer', location: 'Bangalore',
    url: 'https://x/1', applyUrl: 'https://x/1/apply', description: 'desc', postedAt: Date.now(), source: 'greenhouse',
    ...overrides,
  };
}

beforeEach(() => {
  ghFetchJobs.mockReset();
});

describe('scanAll upsert/dedup/soft-close (plan §2.5)', () => {
  test('inserts new jobs and reports them as newJobs', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    ghFetchJobs.mockResolvedValue([job()]);

    const result = await scanAll('Backend Engineer', { companies: [company], db });

    expect(result.jobs).toHaveLength(1);
    expect(result.newJobs).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get('greenhouse:gitlab:1');
    expect(row.status).toBe('active');
    expect(row.first_seen_at).toBe(row.last_seen_at);
  });

  test('re-scanning an unchanged job is not reported as new and keeps first_seen_at', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    ghFetchJobs.mockResolvedValue([job()]);

    await scanAll('Backend Engineer', { companies: [company], db });
    const firstSeenAt1 = db.prepare('SELECT first_seen_at FROM jobs WHERE id = ?').get('greenhouse:gitlab:1').first_seen_at;

    await new Promise(r => setTimeout(r, 5));
    const result2 = await scanAll('Backend Engineer', { companies: [company], db });

    expect(result2.newJobs).toHaveLength(0);
    const firstSeenAt2 = db.prepare('SELECT first_seen_at FROM jobs WHERE id = ?').get('greenhouse:gitlab:1').first_seen_at;
    expect(firstSeenAt2).toBe(firstSeenAt1);
  });

  test('content_hash change updates content fields; unchanged scans leave them alone', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    ghFetchJobs.mockResolvedValueOnce([job()]);
    await scanAll('Backend Engineer', { companies: [company], db });
    const hash1 = db.prepare('SELECT content_hash FROM jobs WHERE id = ?').get('greenhouse:gitlab:1').content_hash;

    ghFetchJobs.mockResolvedValueOnce([job({ title: 'Senior Backend Engineer' })]);
    await scanAll('Backend Engineer', { companies: [company], db });
    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get('greenhouse:gitlab:1');
    expect(row.title).toBe('Senior Backend Engineer');
    expect(row.content_hash).not.toBe(hash1);
  });

  test('soft-closes a job the ATS stops reporting', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    ghFetchJobs.mockResolvedValueOnce([job(), job({ id: 'greenhouse:gitlab:2', title: 'Data Engineer' })]);
    await scanAll('Engineer', { companies: [company], db });

    ghFetchJobs.mockResolvedValueOnce([job()]); // job 2 no longer listed by the ATS
    const result = await scanAll('Engineer', { companies: [company], db });

    expect(result.closed).toBe(1);
    expect(db.prepare('SELECT status FROM jobs WHERE id = ?').get('greenhouse:gitlab:2').status).toBe('closed');
    expect(db.prepare('SELECT status FROM jobs WHERE id = ?').get('greenhouse:gitlab:1').status).toBe('active');
  });

  test('soft-close is based on the FULL ats listing, not the archetype-filtered subset', async () => {
    // job 2 doesn't match "Backend Engineer" but the ATS still reports it —
    // it must stay active even though it's excluded from this scan's `jobs` result.
    const db = freshDb();
    const company = insertCompany(db);
    ghFetchJobs.mockResolvedValue([job(), job({ id: 'greenhouse:gitlab:2', title: 'Sales Account Executive' })]);

    const result = await scanAll('Backend Engineer', { companies: [company], db });

    expect(result.jobs).toHaveLength(1); // only the matching job is returned
    expect(result.closed).toBe(0);
    expect(db.prepare('SELECT status FROM jobs WHERE id = ?').get('greenhouse:gitlab:2').status).toBe('active');
  });

  test('records a provider failure without throwing, and increments fail_count', async () => {
    const db = freshDb();
    const company = insertCompany(db, { fail_count: 0 });
    ghFetchJobs.mockRejectedValue(new Error('boom'));

    const result = await scanAll('Backend Engineer', { companies: [company], db });

    expect(result.errors).toEqual([{ company: 'GitLab', error: 'boom' }]);
    const row = db.prepare('SELECT fail_count, enabled FROM companies WHERE id = 1').get();
    expect(row.fail_count).toBe(1);
    expect(row.enabled).toBe(1);
  });

  test('auto-disables a company after 5 consecutive failures', async () => {
    const db = freshDb();
    const company = insertCompany(db, { fail_count: 4 });
    ghFetchJobs.mockRejectedValue(new Error('boom'));

    await scanAll('Backend Engineer', { companies: [company], db });

    const row = db.prepare('SELECT fail_count, enabled FROM companies WHERE id = 1').get();
    expect(row.fail_count).toBe(5);
    expect(row.enabled).toBe(0);
  });

  test('a successful scan resets fail_count and sets last_ok_at', async () => {
    const db = freshDb();
    const company = insertCompany(db, { fail_count: 3 });
    ghFetchJobs.mockResolvedValue([job()]);

    await scanAll('Backend Engineer', { companies: [company], db });

    const row = db.prepare('SELECT fail_count, last_ok_at FROM companies WHERE id = 1').get();
    expect(row.fail_count).toBe(0);
    expect(row.last_ok_at).toBeGreaterThan(0);
  });
});
