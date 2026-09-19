/**
 * index.js — Scanner v2 orchestrator (plan §2.4/§2.5).
 * registry (companies table) -> provider fan-out (concurrency 5) -> normalize
 * -> filter (archetype + India) -> upsert into `jobs` (dedup/change-detect) ->
 * soft-close jobs the company stopped reporting -> self-heal company health.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
import * as remotive from './providers/remotive.js';
import * as himalayas from './providers/himalayas.js';

const log = createLogger('scan.index');

const PROVIDERS = {
  greenhouse, lever, ashby, smartrecruiters, recruitee, workable, jsonld,
  // Aggregators: one row covers many employers (see providers/remotive.js).
  remotive, himalayas,
};
const CONCURRENCY = 5;

// Minimum gap between live fetches, per ATS platform. Only the aggregators need
// one: their terms ask for a handful of calls per DAY, while httpClient's limiter
// only spaces requests per second. Everything absent here is unthrottled beyond
// that, which is correct for a company board fetched once per scan.
const MIN_SCAN_INTERVAL_MS = {
  remotive: 6 * 60 * 60 * 1000,
  himalayas: 6 * 60 * 60 * 1000,
};
const FAIL_THRESHOLD = 5; // auto-disable a company after this many consecutive failures

// B-01: a company that had a healthy board suddenly returning 0 jobs is more often
// a transient ATS/parse hiccup than a real mass-closure. Above this many previously
// active jobs, a 0-job response is not trusted until it repeats on the NEXT scan —
// the interim sighting is recorded here so it survives process restarts (cron/
// Task-Scheduler invocations are separate processes, not a long-lived watch loop).
// A JSON sidecar under data/ was chosen over a DB column/table because another
// agent is concurrently adding migration v5 to src/core/db.js in this same tree —
// this needs no schema change and no coordination with that work.
const ZERO_JOBS_SUSPECT_THRESHOLD = 5;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ZERO_STREAK_PATH = path.join(__dirname, '../../../data/scan-zero-streak.json');

function loadZeroStreak(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveZeroStreak(filePath, streak) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(streak));
  } catch (err) {
    log.warn('zero_streak_write_failed', { error: err.message });
  }
}

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
      content_hash, status, posted_at, first_seen_at, last_seen_at,
      employment_type, employer
    ) VALUES (
      @id, @company_id, @ats_platform, @title, @location, @url, @apply_url, @description,
      @content_hash, 'active', @posted_at, @now, @now,
      @employment_type, @employer
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
      last_seen_at = excluded.last_seen_at,
      -- Unconditional, unlike the fields above: these are derived, and gating them
      -- on a content change would leave every pre-v4 row NULL forever (their
      -- content_hash never changes, so the CASE arms would never fire).
      employment_type = excluded.employment_type,
      employer        = excluded.employer
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
export async function scanAll(archetype, { companies, db: dbOverride, includeAllLocations = false, zeroStreakFile } = {}) {
  const db = dbOverride || getDb();
  const zeroStreakPath = zeroStreakFile || DEFAULT_ZERO_STREAK_PATH;
  const zeroStreak = loadZeroStreak(zeroStreakPath);
  let zeroStreakChanged = false;
  // Accepts one archetype or several. Several matters for `gigs`, which hunts
  // every archetype in the profile: calling scanAll once per archetype would
  // re-fetch every company's board once per archetype.
  const archetypes = Array.isArray(archetype) ? archetype : [archetype];
  const matchesAnyArchetype = title => archetypes.some(a => jobMatchesArchetype(title, null, a));
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

    // Reuse the existing `last_ok_at` column as the clock, so a 30-minute
    // `watch` loop doesn't make 48 calls/day against a source whose terms ask
    // for a handful. No new column, no new limiter.
    const minInterval = MIN_SCAN_INTERVAL_MS[company.ats_platform];
    if (minInterval && company.last_ok_at && Date.now() - company.last_ok_at < minInterval) {
      log.info('provider_skipped_rate_limit', {
        company: company.name,
        platform: company.ats_platform,
        nextAllowedInMin: Math.ceil((minInterval - (Date.now() - company.last_ok_at)) / 60000),
      });
      // Return cached rows so `list`-style callers still see this source's jobs.
      for (const row of db.prepare(
        `SELECT title, location, url, apply_url AS applyUrl, description,
                posted_at AS postedAt, ats_platform AS source,
                employment_type AS employmentType, employer,
                COALESCE(employer, ?) AS company, id
         FROM jobs WHERE company_id = ? AND status = 'active'`
      ).all(company.name, companyId)) {
        if (matchesAnyArchetype(row.title) &&
            (includeAllLocations || isIndiaLocation(row.location))) allJobs.push(row);
      }
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

    if (normalized.length === 0) {
      const previousActiveCount = db.prepare(
        `SELECT COUNT(*) AS c FROM jobs WHERE company_id = ? AND status = 'active'`
      ).get(companyId).c;

      if (previousActiveCount > ZERO_JOBS_SUSPECT_THRESHOLD) {
        if (!zeroStreak[companyId]) {
          // First 0-job sighting for a previously-healthy board — do not close
          // anything or mark the company healthy yet; wait for confirmation.
          zeroStreak[companyId] = Date.now();
          zeroStreakChanged = true;
          errors.push({
            company: company.name,
            error: `suspected transient failure: 0 jobs returned (previously ${previousActiveCount} active) — will confirm on next scan`,
          });
          log.warn('provider_zero_jobs_suspected', { company: company.name, previousActiveCount });
          return;
        }
        // Seen twice in a row now — accept the drop to zero as real and fall
        // through to the normal close/markOk path below.
        delete zeroStreak[companyId];
        zeroStreakChanged = true;
      }
    } else if (zeroStreak[companyId]) {
      delete zeroStreak[companyId];
      zeroStreakChanged = true;
    }

    // Persist EVERY posting the ATS reports (not just archetype matches) —
    // the jobs table is a shared cache across archetypes, and soft-close
    // must reflect "still open at the ATS", not "still matches this search".
    const matched = normalized
      .filter(j => matchesAnyArchetype(j.title))
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
          employment_type: job.employmentType ?? null,
          employer: job.employer ?? null,
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

  if (zeroStreakChanged) saveZeroStreak(zeroStreakPath, zeroStreak);

  allJobs.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0));
  log.op('scan_all_done', { archetype: archetypes.join(', '), total: allJobs.length, new: newJobs.length, closed, errors: errors.length });

  return { jobs: allJobs, newJobs, closed, errors };
}

export { PROVIDERS };
