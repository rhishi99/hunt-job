// Job identity — docs/fable51-answers.md §2.2.
//
// `jobs.id` is THE identity. Pasted text and foreign URLs become real `jobs`
// rows under a `manual:` platform so nothing needs a second id space.
//
// `canonicalUrl` is pure (no DB, no network) so `db.js`'s v5 migration can use
// it to backfill `jobs.canonical_url` without importing the DB layer here.
// `ensureJobRow` needs a live DB, so it takes one as a parameter (same
// convention as `transition(db, ...)` in ./states.js) instead of importing
// `getDb` — that would create `db.js` <-> `identity.js` <-> `jobEvaluator.js`
// (which itself imports `db.js`) as a static import cycle. `jobEvaluator.js`
// is instead loaded lazily, only when a URL actually needs fetching.
import crypto from 'node:crypto';

// Tracking query params to strip (§2.2): utm_* by prefix, plus these exact keys.
const TRACKING_PARAM_RE = /^(gh_src|gh_jid|source|ref|src|trk)$/i;
const LEVER_PARAM_RE = /^lever-(source|origin)$/i;

function isTrackingParam(key) {
  return /^utm_/i.test(key) || TRACKING_PARAM_RE.test(key) || LEVER_PARAM_RE.test(key);
}

/** sha256 hex digest, used for content hashes and manual: ids. */
export function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function isUrl(input) {
  return typeof input === 'string' && /^https?:\/\//i.test(input.trim());
}

/** Collapses whitespace/case so identical pasted JD text always hashes the same. */
export function normalizeText(text) {
  return String(text).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalizes a job URL for identity matching: lowercase scheme+host, drop
 * fragment, drop tracking query params, collapse a trailing slash, sort the
 * remaining params for determinism. Returns null for non-URL input.
 */
export function canonicalUrl(input) {
  if (!isUrl(input)) return null;
  let u;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  u.hash = '';

  const kept = new URLSearchParams();
  for (const [key, value] of u.searchParams) {
    if (!isTrackingParam(key)) kept.append(key, value);
  }
  kept.sort();

  let pathname = u.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

  const qs = kept.toString();
  return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${pathname}${qs ? '?' + qs : ''}`;
}

function findJobByUrl(db, url, canonical) {
  return db
    .prepare('SELECT id FROM jobs WHERE canonical_url = ? OR url = ? OR apply_url = ? LIMIT 1')
    .get(canonical, url, url);
}

/**
 * Resolves any evaluator input (pasted JD text, or a job URL) to a `jobs.id`,
 * inserting a `manual:` row when nothing matches. Same text/URL pasted twice
 * always returns the same id (§2.2).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} input - a URL or pasted job description text
 * @returns {Promise<string>} jobs.id
 */
export async function ensureJobRow(db, input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    throw new Error('ensureJobRow: input must be a non-empty URL or job description text');
  }

  if (isUrl(input)) {
    const url = input.trim();
    const canonical = canonicalUrl(url);

    const existing = findJobByUrl(db, url, canonical);
    if (existing) return existing.id;

    const id = `manual:${new URL(url).host.toLowerCase()}:${sha256(canonical || url).slice(0, 16)}`;
    const byId = db.prepare('SELECT id FROM jobs WHERE id = ?').get(id);
    if (byId) return byId.id;

    // Lazy import: resolveJobText (jobEvaluator.js) pulls in aiClient/logger,
    // which would otherwise create a static import cycle back to db.js.
    const { resolveJobText } = await import('../jobEvaluator.js');
    const { jobText } = await resolveJobText(url);

    const titleMatch = jobText.match(/^(?:Job Title|Position):\s*(.+)$/m);
    const employerMatch = jobText.match(/^Company:\s*(.+)$/m);
    const now = Date.now();

    db.prepare(`
      INSERT INTO jobs (
        id, company_id, ats_platform, title, url, apply_url, description,
        content_hash, status, canonical_url, employer, description_state,
        first_seen_at, last_seen_at
      ) VALUES (?, 'manual', 'manual', ?, ?, ?, ?, ?, 'active', ?, ?, 'full', ?, ?)
    `).run(
      id,
      titleMatch ? titleMatch[1].trim() : 'Untitled (manual)',
      url,
      url,
      jobText,
      sha256(jobText),
      canonical,
      employerMatch ? employerMatch[1].trim() : null,
      now,
      now
    );
    return id;
  }

  // Pasted text.
  const normalized = normalizeText(input);
  const id = `manual:text:${sha256(normalized).slice(0, 16)}`;
  const existing = db.prepare('SELECT id FROM jobs WHERE id = ?').get(id);
  if (existing) return existing.id;

  const titleMatch = input.match(/^(?:Job Title|Position):\s*(.+)$/m);
  const employerMatch = input.match(/^Company:\s*(.+)$/m);
  const now = Date.now();

  db.prepare(`
    INSERT INTO jobs (
      id, company_id, ats_platform, title, description, content_hash,
      status, employer, description_state, first_seen_at, last_seen_at
    ) VALUES (?, 'manual', 'manual', ?, ?, ?, 'active', ?, 'full', ?, ?)
  `).run(
    id,
    titleMatch ? titleMatch[1].trim() : 'Untitled (manual)',
    input,
    sha256(normalized),
    employerMatch ? employerMatch[1].trim() : null,
    now,
    now
  );
  return id;
}
