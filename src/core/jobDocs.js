/**
 * jobDocs.js — shared helpers for résumé / interview-prep generation:
 *  - B-02: turn any input (URL or pasted text) into real JD text or throw — the
 *    model must never be handed a bare URL and left to invent the posting.
 *  - B-03: `documents` table writer/reader so apply finds THE job's own PDF.
 *  - B-12: pure post-generation PDF text verification.
 *
 * DB functions take `db` as a parameter (same convention as pipeline/*) so
 * tests can pass an in-memory database.
 */
import fs from 'node:fs';
import { isUrl, canonicalUrl } from './pipeline/identity.js';

const MIN_JD_CHARS = 80;

/** Throws if `text` is (or still contains only) a bare URL / is too short to be a JD. */
export function assertJobText(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t || isUrl(t) || t.replace(/\s+/g, '').length < MIN_JD_CHARS) {
    throw new Error(
      'Could not resolve the job description text (got a bare URL or too little text). ' +
      'Paste the full job description instead of a link.'
    );
  }
  return t;
}

/** Looks a URL up in the jobs table (no network). Returns the row or undefined. */
export function findJobByUrl(db, url) {
  if (!db || !isUrl(url)) return undefined;
  const canon = canonicalUrl(url);
  return db
    .prepare('SELECT id, title, employer, description FROM jobs WHERE canonical_url = ? OR url = ? OR apply_url = ? LIMIT 1')
    .get(canon, url.trim(), url.trim());
}

/**
 * B-02 entry point. URL -> stored description if we already have it, else
 * `resolveJobText` (fetch). Pasted text passes through. Never returns a URL.
 * @returns {Promise<{jobText: string, jobId: string|null}>}
 */
export async function resolveJobInput(input, { db = null, resolver = null } = {}) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    throw new Error('No job description or URL provided.');
  }
  if (!isUrl(input)) return { jobText: assertJobText(input), jobId: null };

  const row = findJobByUrl(db, input);
  if (row?.description && row.description.replace(/\s+/g, '').length >= MIN_JD_CHARS) {
    const head = [row.title && `Position: ${row.title}`, row.employer && `Company: ${row.employer}`]
      .filter(Boolean).join('\n');
    return { jobText: assertJobText(`${head}\n\n${row.description}`), jobId: row.id };
  }

  const resolve = resolver || (await import('./jobEvaluator.js')).resolveJobText;
  const { jobText } = await resolve(input.trim());
  return { jobText: assertJobText(jobText), jobId: row?.id ?? null };
}

// ── B-03: documents table ────────────────────────────────────────────────────

/** Insert a `documents` row. Returns its id. */
export function recordDocument(db, { jobId = null, type, filePath, contentHash = null, verification = null }) {
  if (!type || !filePath) throw new Error('recordDocument: type and filePath are required');
  const info = db
    .prepare('INSERT INTO documents (job_id, type, file_path, content_hash, verification) VALUES (?, ?, ?, ?, ?)')
    .run(
      jobId, type, filePath, contentHash,
      verification == null ? null : (typeof verification === 'string' ? verification : JSON.stringify(verification))
    );
  return Number(info.lastInsertRowid);
}

/**
 * Newest existing document of `type` for the job. Resolves the job by id, else
 * by url. Returns `{ id, path }` or null — NEVER falls back to "newest file".
 */
export function findJobDocument(db, { jobId = null, url = null, type = 'resume' } = {}) {
  let id = jobId;
  if (!id && url) id = findJobByUrl(db, url)?.id ?? null;
  if (!id) return null;
  const rows = db
    .prepare('SELECT id, file_path FROM documents WHERE job_id = ? AND type = ? ORDER BY id DESC')
    .all(id, type);
  for (const r of rows) {
    if (fs.existsSync(r.file_path)) return { id: r.id, path: r.file_path };
  }
  return null;
}

// ── B-12: PDF text verification ──────────────────────────────────────────────

/**
 * Pure check of text extracted from a generated PDF.
 * @param {string} text  extracted PDF text
 * @param {{email?: string, phone?: string, skills?: string[], keywords?: string[], minLength?: number}} expect
 * @returns {{ok: boolean, issues: string[], length: number, coverage: number|null}}
 */
export function verifyResumeText(text, { email = '', phone = '', skills = [], keywords = [], minLength = 300 } = {}) {
  const t = String(text || '');
  const flat = t.toLowerCase().replace(/\s+/g, ' ');
  const issues = [];

  if (t.replace(/\s+/g, '').length < minLength) {
    issues.push(`extractable text too short (${t.trim().length} chars) — PDF may be image-based`);
  }
  if (email && !flat.includes(email.toLowerCase())) issues.push('email not found in PDF text');
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits && !t.replace(/\D/g, '').includes(digits)) issues.push('phone not found in PDF text');

  // Coverage: of the JD keywords the candidate genuinely has, how many survived into the PDF.
  const have = new Set(skills.map(s => String(s).toLowerCase()));
  const expected = keywords.filter(k => have.has(String(k).toLowerCase()));
  let coverage = null;
  if (expected.length) {
    const found = expected.filter(k => flat.includes(String(k).toLowerCase()));
    coverage = found.length / expected.length;
    if (coverage < 0.8) {
      issues.push(`keyword coverage ${Math.round(coverage * 100)}% (${found.length}/${expected.length})`);
    }
  }
  return { ok: issues.length === 0, issues, length: t.length, coverage };
}
