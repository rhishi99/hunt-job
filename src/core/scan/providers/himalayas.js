/**
 * himalayas.js — Himalayas remote-jobs API (aggregator provider).
 *
 * Same aggregator shape as remotive.js: company_id is the SOURCE, the hiring
 * company goes in `employer`. See that file's header for why.
 *
 * Himalayas exposes a real `employmentType` field ("Full Time", "Contractor",
 * "Part Time"), which is the reason it's worth having alongside Remotive.
 *
 * Pagination is cursor-based (`nextCursor`), capped below so a runaway cursor
 * can't spin forever.
 */
import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

// Aggregator: one endpoint, no per-company board token — auditPortals.js/
// index.js use this to exempt the source row from "missing a slug" handling.
export const needsSlug = false;

// The API caps a page at 20 regardless of `limit`, and ignores every filter
// param we probed (category/categories/search/q all return the same unfiltered
// firehose, ~100k postings). So this is a newest-first feed we sample the head
// of, not a query we can narrow server-side.
//
// ponytail: 25 pages ≈ 500 newest postings ≈ well over a day of their volume,
// which is ample at the 6h scan interval below. Raise MAX_PAGES if a scan ever
// reports the last page still full of unseen jobs — the real fix would be a
// server-side category filter, which they don't offer today.
const PAGE_SIZE = 20;
const MAX_PAGES = 25;
const BASE = 'https://himalayas.app/jobs/api';

// Scan interval is enforced centrally in scan/index.js (MIN_SCAN_INTERVAL_MS) — 6h.


/** Pure parse of one page — exported for fixture tests (no network). */
export function parse(data, companyRef = {}) {
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(j => normalizeJob({
    platform: 'himalayas',
    companyToken: companyRef.slug || 'himalayas',
    // guid is the canonical posting URL; fall back to the company/title pair.
    externalId: j.guid || j.applicationLink || `${j.companySlug}-${j.title}`,
    company: j.companyName,
    employer: j.companyName,
    title: j.title,
    // locationRestrictions is an eligibility list, not a city. Empty means
    // worldwide, which for a remote gig is the most permissive case.
    location: j.locationRestrictions?.length ? j.locationRestrictions.join(', ') : 'Remote',
    url: j.guid || j.applicationLink,
    applyUrl: j.applicationLink || j.guid,
    description: cleanHtml(j.description || j.excerpt || ''),
    postedAt: j.pubDate ? j.pubDate * 1000 : null, // unix SECONDS
    employmentType: j.employmentType, // "Full Time" | "Contractor" | "Part Time"
  }));
}

export async function fetchJobs(companyRef = {}) {
  const all = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${BASE}?limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await fetchJson(url);
    const jobs = parse(data, companyRef);
    if (!jobs.length) break;
    all.push(...jobs);

    // Only the cursor decides whether more pages exist. A short page is NOT an
    // end-of-feed signal here: the server caps pages below whatever `limit` we
    // ask for, so a length check would stop after page one.
    cursor = data?.nextCursor;
    if (!cursor) break;
  }
  return all;
}
