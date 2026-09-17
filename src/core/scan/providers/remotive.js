/**
 * remotive.js — Remotive public job API (aggregator provider).
 *
 * Unlike the ATS providers, this is NOT one employer's board: one response
 * carries many companies. So `companyToken`/`company_id` is the SOURCE
 * ('remotive') and the hiring company goes in `employer`, which query.js
 * COALESCEs ahead of the companies-table name. Soft-close then works
 * correctly at source granularity: whatever Remotive still lists is active,
 * whatever dropped off is closed.
 *
 * ATTRIBUTION (required by Remotive's API terms, returned in every response):
 * jobs link back to the remotive.com URL and name Remotive as the source. Do
 * not resyndicate these to third-party job sites. Listings are delayed 24h by
 * Remotive by design.
 *
 * RATE LIMIT: their terms ask for a handful of calls per day, not per minute.
 * scan/index.js enforces a 6h gap (MIN_SCAN_INTERVAL_MS) against the company
 * row's `last_ok_at`, so a 30-minute `watch` loop won't hammer them.
 */
import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

// Remotive's own category slug for infra work. Their taxonomy is coarse — this
// is the closest bucket to DevOps/SRE/platform.
const CATEGORY = 'devops-sysadmin';
const ENDPOINT = `https://remotive.com/api/remote-jobs?category=${CATEGORY}`;

// Scan interval is enforced centrally in scan/index.js (MIN_SCAN_INTERVAL_MS),
// which is where last_ok_at lives — 6h for this source.

/** Pure parse — exported for fixture tests (no network). */
export function parse(data, companyRef = {}) {
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(j => normalizeJob({
    platform: 'remotive',
    companyToken: companyRef.slug || CATEGORY,
    externalId: String(j.id),
    company: j.company_name,
    employer: j.company_name,
    title: j.title,
    // Remotive has no city — it has an eligibility restriction, which is the
    // thing that actually decides whether you can take the job.
    location: j.candidate_required_location || 'Remote',
    url: j.url,
    applyUrl: j.url,
    description: cleanHtml(j.description),
    postedAt: j.publication_date ? new Date(j.publication_date).getTime() : null,
    employmentType: j.job_type, // full_time | part_time | contract | freelance | ...
  }));
}

export async function fetchJobs(companyRef = {}) {
  const data = await fetchJson(ENDPOINT);
  return parse(data, companyRef);
}
