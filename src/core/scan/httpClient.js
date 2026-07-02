/**
 * httpClient.js — polite fetch wrapper for ATS scan providers.
 * 30s timeout, 2 retries with exponential backoff, per-hostname rate limit
 * (max 2 req/sec), ETag/If-Modified-Since cache (SQLite `http_cache` table),
 * honors Retry-After. No new dependencies — native fetch only.
 */
import { getDb } from '../db.js';
import { createLogger } from '../logger.js';

const log = createLogger('scan.httpClient');

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const MIN_GAP_MS = 500; // 2 req/sec per host

// ponytail: fixed-gap throttle per host, not a token bucket — good enough at
// our request volume (tens of companies, not thousands). Upgrade if we ever
// burst-scan hundreds of hosts concurrently.
const lastRequestAtByHost = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  return 500 * 2 ** attempt; // 500ms, 1000ms
}

function parseRetryAfter(value) {
  if (!value) return null;
  const asInt = Number(value);
  if (Number.isFinite(asInt)) return asInt * 1000;
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

async function throttle(hostname) {
  const last = lastRequestAtByHost.get(hostname) || 0;
  const wait = MIN_GAP_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastRequestAtByHost.set(hostname, Date.now());
}

function getCacheRow(url) {
  const db = getDb();
  return db.prepare('SELECT * FROM http_cache WHERE url = ?').get(url);
}

function saveCacheRow(url, { etag, lastModified, status, body }) {
  if (!etag && !lastModified) return; // nothing to key future conditional requests on
  const db = getDb();
  db.prepare(`
    INSERT INTO http_cache (url, etag, last_modified, status, body, cached_at)
    VALUES (@url, @etag, @lastModified, @status, @body, @cachedAt)
    ON CONFLICT(url) DO UPDATE SET
      etag = excluded.etag, last_modified = excluded.last_modified,
      status = excluded.status, body = excluded.body, cached_at = excluded.cached_at
  `).run({ url, etag: etag ?? null, lastModified: lastModified ?? null, status, body, cachedAt: Date.now() });
}

/**
 * Fetches a URL with timeout/retry/rate-limit/ETag caching.
 * Returns the raw response text (or the cached body on a 304).
 */
export async function fetchRaw(url, opts = {}) {
  const hostname = new URL(url).hostname;
  const cacheRow = getCacheRow(url);
  const headers = { ...(opts.headers || {}) };
  if (cacheRow?.etag) headers['If-None-Match'] = cacheRow.etag;
  if (cacheRow?.last_modified) headers['If-Modified-Since'] = cacheRow.last_modified;

  let attempt = 0;
  for (;;) {
    await throttle(hostname);
    let res;
    try {
      res = await fetch(url, { ...opts, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(backoffMs(attempt));
      attempt++;
      continue;
    }

    if (res.status === 304 && cacheRow) {
      return cacheRow.body;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      await sleep(retryAfterMs ?? backoffMs(attempt));
      attempt++;
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const text = await res.text();
    saveCacheRow(url, {
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      status: res.status,
      body: text,
    });
    return text;
  }
}

/** Fetches JSON. Returns null (not throw) on parse failure of an empty/blank body. */
export async function fetchJson(url, opts = {}) {
  const text = await fetchRaw(url, opts);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    log.warn('json_parse_failed', { url, error: err.message });
    return null;
  }
}

/** Fetches raw text (HTML pages) — used by detect.js DOM fingerprint fallback. */
export async function fetchText(url, opts = {}) {
  return fetchRaw(url, opts);
}
