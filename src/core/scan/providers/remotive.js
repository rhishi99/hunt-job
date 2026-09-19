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

// Aggregator: one endpoint, no per-company board token — auditPortals.js/
// index.js use this to exempt the source row from "missing a slug" handling.
export const needsSlug = false;

// B-11: Remotive's taxonomy is coarse. Map profile archetypes onto its category
// slugs (first matching rule wins per archetype) instead of hardcoding one bucket.
const DEFAULT_CATEGORY = 'devops-sysadmin';
const CATEGORY_RULES = [
  [/devops|sre|reliability|platform|infra|cloud|kubernetes|sysadmin|security/i, 'devops-sysadmin'],
  [/data|analytics|machine learning|\bml\b|\bai\b|mlops/i, 'data'],
  [/\bqa\b|quality|test|sdet/i, 'qa'],
  [/product/i, 'product'],
  [/backend|frontend|front-end|back-end|full[\s-]?stack|software|developer|mobile|engineer/i, 'software-dev'],
];

/** Pure: archetype names -> distinct Remotive category slugs (default when none map). */
export function categoriesFor(archetypes) {
  const out = new Set();
  for (const a of archetypes || []) {
    const hit = CATEGORY_RULES.find(([re]) => re.test(String(a)));
    if (hit) out.add(hit[1]);
  }
  return out.size ? [...out] : [DEFAULT_CATEGORY];
}

const endpointFor = category => `https://remotive.com/api/remote-jobs?category=${category}`;

// Scan interval is enforced centrally in scan/index.js (MIN_SCAN_INTERVAL_MS),
// which is where last_ok_at lives — 6h for this source.

/** Pure parse — exported for fixture tests (no network). */
export function parse(data, companyRef = {}) {
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(j => normalizeJob({
    platform: 'remotive',
    companyToken: companyRef.slug || DEFAULT_CATEGORY,
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
  const byId = new Map();
  for (const category of categoriesFor(companyRef.archetypes)) {
    for (const j of parse(await fetchJson(endpointFor(category)), companyRef)) byId.set(j.id, j);
  }
  return [...byId.values()];
}
