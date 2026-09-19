import { describe, test, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';

vi.mock('../../src/core/scan/providers/greenhouse.js', () => ({ fetchJobs: vi.fn(), needsSlug: undefined }));
vi.mock('../../src/core/scan/providers/jsonld.js', () => ({ needsSlug: false, fetchJobs: vi.fn() }));
vi.mock('../../src/core/scan/providers/remotive.js', () => ({ needsSlug: false, fetchJobs: vi.fn() }));
vi.mock('../../src/core/scan/detect.js', () => ({ detect: vi.fn() }));

const { fetchJobs: ghFetchJobs } = await import('../../src/core/scan/providers/greenhouse.js');
const { fetchJobs: jsonldFetchJobs } = await import('../../src/core/scan/providers/jsonld.js');
const { fetchJobs: remotiveFetchJobs } = await import('../../src/core/scan/providers/remotive.js');
const { detect } = await import('../../src/core/scan/detect.js');
const { auditCompany } = await import('../../src/cli/auditPortals.js');

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function insertCompany(db, overrides = {}) {
  const c = { name: 'Placeholder', slug: null, ats_platform: null, career_url: null, fail_count: 0, enabled: 1, ...overrides };
  db.prepare(`
    INSERT INTO companies (name, slug, ats_platform, career_url, fail_count, enabled)
    VALUES (@name, @slug, @ats_platform, @career_url, @fail_count, @enabled)
  `).run(c);
  return db.prepare('SELECT * FROM companies WHERE name = ?').get(c.name);
}

describe('auditCompany — slug-less providers are never flagged as broken', () => {
  test('a jsonld row with no slug is audited via career_url, not re-detected', async () => {
    const db = freshDb();
    const company = insertCompany(db, { name: 'SomeCo', ats_platform: 'jsonld', slug: null, career_url: 'https://someco.example/careers' });
    jsonldFetchJobs.mockResolvedValue([{ title: 'Engineer' }]);

    const result = await auditCompany(db, company);

    expect(detect).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/1 jobs/);
  });

  test('an aggregator row (remotive) with no slug and no career_url is not flagged', async () => {
    const db = freshDb();
    const company = insertCompany(db, { name: 'Remotive', ats_platform: 'remotive', slug: null, career_url: null });
    remotiveFetchJobs.mockResolvedValue([{ title: 'Remote Job' }]);

    const result = await auditCompany(db, company);

    expect(detect).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  test('a slug-requiring provider (greenhouse) with a missing slug is flagged, not re-detected', async () => {
    const db = freshDb();
    const company = insertCompany(db, { name: 'BrokenCo', ats_platform: 'greenhouse', slug: null, career_url: 'https://brokenco.example' });

    const result = await auditCompany(db, company);

    expect(detect).not.toHaveBeenCalled();
    expect(ghFetchJobs).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/needs a slug/);
  });

  test('a scan_config-driven platform with no provider yet (workday) is reported cleanly, not as ATS-undetected', async () => {
    const db = freshDb();
    const company = insertCompany(db, {
      name: 'Accenture', ats_platform: 'workday', slug: null, career_url: null,
    });

    const result = await auditCompany(db, company);

    expect(detect).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no scan provider yet/);
  });

  test('a row with no platform at all still goes through detect() as before', async () => {
    const db = freshDb();
    const company = insertCompany(db, { name: 'UnknownCo', ats_platform: null, slug: null, career_url: 'https://unknownco.example' });
    detect.mockResolvedValue({ platform: 'greenhouse', token: 'unknownco' });
    ghFetchJobs.mockResolvedValue([{ title: 'Job' }]);

    const result = await auditCompany(db, company);

    expect(detect).toHaveBeenCalledWith('https://unknownco.example');
    expect(result.ok).toBe(true);
  });
});
