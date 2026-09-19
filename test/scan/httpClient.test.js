import { describe, test, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
vi.mock('../../src/core/db.js', () => ({
  getDb: () => db,
}));

// Imported after the mock so httpClient's `getDb()` resolves to our in-memory db.
const { fetchJson } = await import('../../src/core/scan/httpClient.js');

function freshDb() {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE http_cache (
      url TEXT PRIMARY KEY, etag TEXT, last_modified TEXT, status INTEGER, body TEXT, cached_at INTEGER
    );
  `);
  return d;
}

function mockFetchOnce(text) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(text),
  }));
}

beforeEach(() => {
  db = freshDb();
  vi.unstubAllGlobals();
});

describe('fetchJson (B-01: unparseable body must not look like "zero jobs")', () => {
  test('returns null for an empty body — nothing to parse, not an error', async () => {
    mockFetchOnce('');
    const result = await fetchJson('https://example1.test/jobs');
    expect(result).toBeNull();
  });

  test('returns null for a blank/whitespace-only body', async () => {
    mockFetchOnce('   \n  ');
    const result = await fetchJson('https://example2.test/jobs');
    expect(result).toBeNull();
  });

  test('throws on a non-empty unparseable body instead of silently returning null', async () => {
    mockFetchOnce('<html><body>Service temporarily unavailable</body></html>');
    await expect(fetchJson('https://example3.test/jobs')).rejects.toThrow(/Unparseable JSON/);
  });

  test('parses a valid JSON body normally', async () => {
    mockFetchOnce('{"jobs":[{"id":1}]}');
    const result = await fetchJson('https://example4.test/jobs');
    expect(result).toEqual({ jobs: [{ id: 1 }] });
  });
});
