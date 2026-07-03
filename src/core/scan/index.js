/**
 * index.js — Scanner v2 orchestrator (plan §2.4/§2.5).
 * registry (companies table) -> provider fan-out (concurrency 5) -> normalize
 * -> filter (archetype + India) -> upsert into `jobs` (dedup/change-detect) ->
 * soft-close jobs the company stopped reporting -> self-heal company health.
 */
import crypto from 'crypto';
import { getDb } from '../db.js';
import { createLogger } from '../logger.js';
import { isIndiaLocation, jobMatchesArchetype } from './normalize.js';
import * as greenhouse from './providers/greenhouse.js';
import * as lever from './providers/lever.js';
import * as ashby from './providers/ashby.js';
import * as smartrecruiters from './providers/smartrecruiters.js';
import * as recruitee from './providers/recruitee.js';
import * as workable from './providers/workable.js';
import * as jsonld from './providers/jsonld.js';

const log = createLogger('scan.index');

const PROVIDERS = { greenhouse, lever, ashby, smartrecruiters, recruitee, workable, jsonld };
const CONCURRENCY = 5;
const FAIL_THRESHOLD = 5; // auto-disable a company after this many consecutive failures

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function loadEnabledCompanies(db) {
  // jsonld doesn't need a board `slug` (it only needs career_url), unlike the
  // API providers — so it's exempted from the slug requirement below.
  return db.prepare(`
    SELECT * FROM companies
    WHERE enabled = 1 AND ats_platform IS NOT NULL AND ats_platform != ''
      AND (ats_platform = 'jsonld' OR (slug IS NOT NULL AND slug != ''))
  `).all();
}

function contentHash(job) {
  return crypto.createHash('sha256').update(`${job.title}|${job.location}|${job.description}`).digest('hex');
}

function upsertStatement(db) {
  return db.prepare(`
    INSERT INTO jobs (
      id, company_id, ats_platform, title, location, url, apply_url, description,
      content_hash, status, posted_at, first_seen_at, last_seen_at
    ) VALUES (
      @id, @company_id, @ats_platform, @title, @location, @url, @apply_url, @description,
      @content_hash, 'active', @posted_at, @now, @now
    )
    ON CONFLICT(id) DO UPDATE SET
      title        = CASE WHEN excluded.content_hash != jobs.content_hash THEN excluded.title ELSE jobs.title END,
      location     = CASE WHEN excluded.content_hash != jobs.content_hash THEN excluded.location ELSE jobs.location END,
      url          = CASE WHEN excluded.content_hash != jobs.content_hash THEN excluded.url ELSE jobs.url END,
      apply_url    = CASE WHEN excluded.content_hash != jobs.content_hash THEN excluded.apply_url ELSE jobs.apply_url END,
      description  = CASE WHEN excluded.content_hash != jobs.content_hash THEN excluded.description ELSE jobs.description END,
      posted_at    = CASE WHEN excluded.content_hash != jobs.content_hash THEN excluded.posted_at ELSE jobs.posted_at END,
      content_hash = excluded.content_hash,
      status       = 'active',
      last_seen_at = excluded.last_seen_at
  `);
}

/**
 * Scans every enabled, ATS-known company (or an explicit `companies` override
 * — used by tests/live-smoke to bypass the DB registry), normalizes +
 * filters results, and upserts them into the `jobs` table.
 *
 * @param {string} archetype
 * @param {{companies?: Array, db?: import('better-sqlite3').Database}} opts
 *   `db` override is for tests — defaults to the real singleton connection.
 * @returns {Promise<{jobs: Array, newJobs: Array, closed: number, errors: Array}>}
 */
export async function scanAll(archetype, { companies, db: dbOverride, includeAllLocations = false } = {}) {
  const db = dbOverride || getDb();
  const companyRows = companies?.length ? companies : loadEnabledCompanies(db);
  const existingIds = new Set(db.prepare('SELECT id FROM jobs').pluck().all());

  const upsert = upsertStatement(db);
  const markCompanyOk = db.prepare(`UPDATE companies SET last_ok_at = ?, fail_count = 0 WHERE id = ?`);
  const markCompanyFail = db.prepare(`
    UPDATE companies SET fail_count = fail_count + 1,
      enabled = CASE WHEN fail_count + 1 >= ? THEN 0 ELSE enabled END
    WHERE id = ?
  `);
  const closeAllForCompany = db.prepare(`UPDATE jobs SET status = 'closed' WHERE company_id = ? AND status = 'active'`);

  const allJobs = [];
  const newJobs = [];
  const errors = [];
  let closed = 0;

  await mapLimit(companyRows, CONCURRENCY, async company => {
    const provider = PROVIDERS[company.ats_platform];
    const companyId = String(company.id ?? company.name);
    if (!provider) {
      errors.push({ company: company.name, error: `no provider for ats_platform "${company.ats_platform}"` });
      return;
    }

    let normalized;
    try {
      normalized = await provider.fetchJobs(company);
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
      if (company.id != null) markCompanyFail.run(FAIL_THRESHOLD, company.id);
      log.warn('provider_fetch_failed', { company: company.name, platform: company.ats_platform, error: err.message });
      return;
    }

    // Persist EVERY posting the ATS reports (not just archetype matches) —
    // the jobs table is a shared cache across archetypes, and soft-close
    // must reflect "still open at the ATS", not "still matches this search".
    const matched = normalized
      .filter(j => jobMatchesArchetype(j.title, null, archetype))
      .filter(j => includeAllLocations || isIndiaLocation(j.location));

    const now = Date.now();
    const seenIds = [];
    const txn = db.transaction(jobs => {
      for (const job of jobs) {
        const row = {
          id: job.id,
          company_id: companyId,
          ats_platform: company.ats_platform,
          title: job.title,
          location: job.location,
          url: job.url,
          apply_url: job.applyUrl,
          description: job.description,
          content_hash: contentHash(job),
          posted_at: job.postedAt,
          now,
        };
        upsert.run(row);
        seenIds.push(job.id);
      }
      if (seenIds.length) {
        const placeholders = seenIds.map(() => '?').join(',');
        closed += db.prepare(
          `UPDATE jobs SET status = 'closed' WHERE company_id = ? AND status = 'active' AND id NOT IN (${placeholders})`
        ).run(companyId, ...seenIds).changes;
      } else {
        closed += closeAllForCompany.run(companyId).changes;
      }
    });
    txn(normalized);

    for (const job of matched) {
      if (!existingIds.has(job.id)) newJobs.push(job);
      allJobs.push(job);
    }

    if (company.id != null) markCompanyOk.run(now, company.id);
  });

  allJobs.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0));
  log.op('scan_all_done', { archetype, total: allJobs.length, new: newJobs.length, closed, errors: errors.length });

  return { jobs: allJobs, newJobs, closed, errors };
}

export { PROVIDERS };
