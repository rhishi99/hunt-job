import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { canonicalUrl, sha256, normalizeText, isUrl, ensureJobRow } from '../../src/core/pipeline/identity.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('canonicalUrl', () => {
  test('lowercases scheme and host', () => {
    expect(canonicalUrl('HTTPS://Boards.Greenhouse.IO/acme/jobs/1')).toBe('https://boards.greenhouse.io/acme/jobs/1');
  });

  test('drops the fragment', () => {
    expect(canonicalUrl('https://jobs.lever.co/acme/abc#apply')).toBe('https://jobs.lever.co/acme/abc');
  });

  test('drops utm_* and known tracking params', () => {
    const u = 'https://boards.greenhouse.io/acme/jobs/1?utm_source=li&utm_campaign=x&gh_src=abc&gh_jid=1&ref=home&source=email&src=x&trk=y';
    expect(canonicalUrl(u)).toBe('https://boards.greenhouse.io/acme/jobs/1');
  });

  test('drops lever-source and lever-origin params', () => {
    expect(canonicalUrl('https://jobs.lever.co/acme/abc?lever-source=LinkedIn&lever-origin=applied')).toBe(
      'https://jobs.lever.co/acme/abc'
    );
  });

  test('keeps non-tracking query params, sorted for determinism', () => {
    expect(canonicalUrl('https://example.com/jobs?b=2&a=1')).toBe('https://example.com/jobs?a=1&b=2');
    expect(canonicalUrl('https://example.com/jobs?a=1&b=2')).toBe('https://example.com/jobs?a=1&b=2');
  });

  test('collapses a trailing slash but keeps bare root', () => {
    expect(canonicalUrl('https://example.com/jobs/1/')).toBe('https://example.com/jobs/1');
    expect(canonicalUrl('https://example.com/')).toBe('https://example.com/');
  });

  test('two URLs differing only by tracking params canonicalize identically', () => {
    const a = canonicalUrl('https://boards.greenhouse.io/acme/jobs/42?gh_src=x');
    const b = canonicalUrl('https://boards.greenhouse.io/acme/jobs/42?utm_source=twitter');
    expect(a).toBe(b);
  });

  test('returns null for non-URL input', () => {
    expect(canonicalUrl('Not a url, just pasted JD text.')).toBeNull();
    expect(canonicalUrl('')).toBeNull();
    expect(canonicalUrl(null)).toBeNull();
  });
});

describe('isUrl / normalizeText / sha256', () => {
  test('isUrl recognizes http(s), rejects everything else', () => {
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('http://example.com')).toBe(true);
    expect(isUrl('Position: SWE\nCompany: Acme')).toBe(false);
    expect(isUrl('ftp://example.com')).toBe(false);
  });

  test('normalizeText collapses whitespace and case so identical pastes match', () => {
    expect(normalizeText('  Hello   World  \n\n')).toBe(normalizeText('hello world'));
  });

  test('sha256 is deterministic', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });
});

describe('ensureJobRow', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  test('pasted text: same text pasted twice returns the same jobs.id', async () => {
    const text = 'Position: DevOps Engineer\nCompany: Acme\n\nWe need a DevOps engineer with 5 years experience.';
    const id1 = await ensureJobRow(db, text);
    const id2 = await ensureJobRow(db, text);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^manual:text:[0-9a-f]{16}$/);

    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id1);
    expect(row.title).toBe('DevOps Engineer');
    expect(row.employer).toBe('Acme');
    expect(row.description_state).toBe('full');
    expect(db.prepare('SELECT count(*) c FROM jobs').get().c).toBe(1);
  });

  test('pasted text: whitespace-only differences still dedupe (normalizeText)', async () => {
    const id1 = await ensureJobRow(db, 'Some job description here.');
    const id2 = await ensureJobRow(db, '  Some   job description here.  ');
    expect(id1).toBe(id2);
  });

  test('different pasted texts get different job ids', async () => {
    const id1 = await ensureJobRow(db, 'Job A description');
    const id2 = await ensureJobRow(db, 'Job B description');
    expect(id1).not.toBe(id2);
  });

  test('URL: hits an existing jobs row by canonical_url without fetching', async () => {
    db.prepare(`
      INSERT INTO jobs (id, company_id, ats_platform, title, url, canonical_url, first_seen_at, last_seen_at)
      VALUES ('greenhouse:acme:1', 'acme', 'greenhouse', 'SWE', 'https://boards.greenhouse.io/acme/jobs/1', 'https://boards.greenhouse.io/acme/jobs/1', 0, 0)
    `).run();

    // Tracking params differ from the stored row but canonicalize the same — a hit must not fetch.
    const id = await ensureJobRow(db, 'https://boards.greenhouse.io/acme/jobs/1?utm_source=li');
    expect(id).toBe('greenhouse:acme:1');
  });

  test('URL: hits by raw apply_url match even if canonical_url column is unset', async () => {
    db.prepare(`
      INSERT INTO jobs (id, company_id, ats_platform, title, apply_url, first_seen_at, last_seen_at)
      VALUES ('lever:acme:xyz', 'acme', 'lever', 'SWE', 'https://jobs.lever.co/acme/xyz', 0, 0)
    `).run();

    const id = await ensureJobRow(db, 'https://jobs.lever.co/acme/xyz');
    expect(id).toBe('lever:acme:xyz');
  });

  test('rejects empty input', async () => {
    await expect(ensureJobRow(db, '')).rejects.toThrow();
    await expect(ensureJobRow(db, '   ')).rejects.toThrow();
  });
});
