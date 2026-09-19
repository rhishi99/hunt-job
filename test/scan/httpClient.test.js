import { describe, test, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
vi.mock('../../src/core/db.js', () => ({
  getDb: () => db,
}));

// Imported after the mock so httpClient's `getDb()` resolves to our in-memory db.
const { fetchJson, throttle, _resetThrottle } = await import('../../src/core/scan/httpClient.js');

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

describe('throttle (B-05: slot reserved synchronously)', () => {
  test('concurrent callers on one host are spaced by the gap, not released together', async () => {
    _resetThrottle();
    const t0 = Date.now();
    const times = await Promise.all(Array.from({ length: 4 }, () => throttle('same.test').then(() => Date.now() - t0)));
    times.sort((a, b) => a - b);
    // 4 callers -> slots at 0, 500, 1000, 1500ms (allow timer slack)
    expect(times[1]).toBeGreaterThanOrEqual(450);
    expect(times[2]).toBeGreaterThanOrEqual(950);
    expect(times[3]).toBeGreaterThanOrEqual(1450);
  }, 10000);
});

describe('http_cache (B-14)', () => {
  test('paginated (cursor) URLs are not cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: h => (h === 'etag' ? '"x"' : null) },
      text: () => Promise.resolve('{"a":1}'),
    }));
    await fetchJson('https://pg.test/api?cursor=abc');
    await fetchJson('https://pg.test/api');
    const urls = db.prepare('SELECT url FROM http_cache').pluck().all();
    expect(urls).toEqual(['https://pg.test/api']);
  });
});
