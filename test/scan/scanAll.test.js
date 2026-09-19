import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
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

// Seeds N pre-existing ACTIVE jobs directly into the jobs table, simulating a
// company that was already healthy before this scan runs.
function insertActiveJobs(db, companyId, count) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO jobs (id, company_id, ats_platform, title, location, url, apply_url, description,
      content_hash, status, posted_at, first_seen_at, last_seen_at)
    VALUES (@id, @company_id, 'greenhouse', @title, 'Bangalore', @url, @url, 'desc',
      @hash, 'active', @now, @now, @now)
  `);
  for (let i = 0; i < count; i++) {
    stmt.run({
      id: `greenhouse:gitlab:${i}`, company_id: String(companyId), title: `Job ${i}`,
      url: `https://x/${i}`, hash: `hash-${i}`, now,
    });
  }
}

function tmpZeroStreakFile() {
  return path.join(os.tmpdir(), `hunt-job-test-zero-streak-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

describe('scanAll zero-jobs suspicion (B-01)', () => {
  let zeroStreakFile;

  beforeEach(() => {
    zeroStreakFile = tmpZeroStreakFile();
  });

  afterEach(() => {
    try { fs.unlinkSync(zeroStreakFile); } catch { /* never written — fine */ }
  });

  test('a previously-healthy company (>5 active) returning 0 jobs the first time does NOT close anything', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    insertActiveJobs(db, company.id, 6);
    ghFetchJobs.mockResolvedValueOnce([]); // provider succeeded, reported nothing

    const result = await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile });

    expect(result.closed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/suspected transient failure/);
    const activeCount = db.prepare(`SELECT COUNT(*) AS c FROM jobs WHERE status = 'active'`).get().c;
    expect(activeCount).toBe(6);
    const companyRow = db.prepare('SELECT last_ok_at, fail_count FROM companies WHERE id = 1').get();
    expect(companyRow.last_ok_at).toBeFalsy(); // not marked healthy on an unconfirmed zero
  });

  test('0 jobs confirmed on the NEXT scan closes the jobs and marks the company healthy', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    insertActiveJobs(db, company.id, 6);
    ghFetchJobs.mockResolvedValue([]); // same empty result both scans

    const first = await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile });
    expect(first.closed).toBe(0); // first sighting — still suspected, not acted on

    const second = await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile });

    expect(second.closed).toBe(6);
    const activeCount = db.prepare(`SELECT COUNT(*) AS c FROM jobs WHERE status = 'active'`).get().c;
    expect(activeCount).toBe(0);
    const companyRow = db.prepare('SELECT last_ok_at FROM companies WHERE id = 1').get();
    expect(companyRow.last_ok_at).toBeGreaterThan(0);
  });

  test('a company at/below the suspicion threshold closes immediately on the first 0-job scan', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    insertActiveJobs(db, company.id, 3); // below ZERO_JOBS_SUSPECT_THRESHOLD
    ghFetchJobs.mockResolvedValueOnce([]);

    const result = await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile });

    expect(result.closed).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  test('recovering (non-zero jobs) after a suspected zero resets the streak', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    insertActiveJobs(db, company.id, 6);
    ghFetchJobs.mockResolvedValueOnce([]); // suspected zero #1
    await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile });

    ghFetchJobs.mockResolvedValueOnce([job()]); // board is back — streak should clear
    const recovered = await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile });
    expect(recovered.closed).toBeGreaterThan(0); // the 6 stale jobs not re-reported get closed normally

    // Active count is now back below the suspicion threshold (recovery closed
    // the stale rows), so this next 0-job scan is no longer suspicious — proving
    // the earlier streak entry was actually cleared rather than left dangling.
    ghFetchJobs.mockResolvedValueOnce([]);
    const result = await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile });
    expect(result.errors).toHaveLength(0);
  });
});

describe('B-06 partial feeds', () => {
  test('partial feed skips NOT-IN sweep; closes only rows older than 7d', async () => {
    const db = freshDb();
    const company = insertCompany(db);
    insertActiveJobs(db, company.id, 3);
    db.prepare(`UPDATE jobs SET last_seen_at = ? WHERE id = 'greenhouse:gitlab:2'`).run(Date.now() - 8 * 86400000);
    const feed = [job({ id: 'greenhouse:gitlab:9' })];
    feed.partial = true;
    ghFetchJobs.mockResolvedValue(feed);

    await scanAll('Backend Engineer', { companies: [company], db, zeroStreakFile: tmpZeroStreakFile() });

    const st = id => db.prepare('SELECT status FROM jobs WHERE id = ?').get(id).status;
    expect(st('greenhouse:gitlab:0')).toBe('active');
    expect(st('greenhouse:gitlab:2')).toBe('closed');
  });
});

describe('B-09 canary re-probe', () => {
  test('disabled company is scheduled, then re-enabled once a due probe returns jobs', async () => {
    const db = freshDb();
    insertCompany(db);
    db.prepare('UPDATE companies SET enabled = 0, fail_count = 5 WHERE id = 1').run();
    const zeroStreakFile = tmpZeroStreakFile();
    const canaryFile = path.join(path.dirname(zeroStreakFile), 'scan-canary.json');
    try { fs.unlinkSync(canaryFile); } catch { /* none */ }
    ghFetchJobs.mockResolvedValue([job()]);
    try {
      await scanAll('Backend Engineer', { db, zeroStreakFile });
      expect(ghFetchJobs).not.toHaveBeenCalled();
      const state = JSON.parse(fs.readFileSync(canaryFile, 'utf-8'));
      state['1'].nextAt = Date.now() - 1000;
      fs.writeFileSync(canaryFile, JSON.stringify(state));

      await scanAll('Backend Engineer', { db, zeroStreakFile });
      const row = db.prepare('SELECT enabled, fail_count FROM companies WHERE id = 1').get();
      expect(row.enabled).toBe(1);
      expect(row.fail_count).toBe(0);
    } finally {
      try { fs.unlinkSync(canaryFile); } catch { /* ok */ }
    }
  });
});
