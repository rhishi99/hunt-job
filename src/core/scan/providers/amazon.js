/**
 * amazon.js — amazon.jobs search.json (UNOFFICIAL; docs/fable51-answers.md §4.3 #4).
 * Full description in the list response. Not a published API: relies on the
 * companies.fail_count quarantine and will need fixing when Amazon changes it.
 * scan_config (optional): { country = 'IND' }. Keyword search => result.partial = true.
 */
import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';
import { readScanConfig, searchTerms } from '../scanConfig.js';

export const needsSlug = false;

const PAGE = 100;
const MAX_PAGES = 3;

/** Pure parse of `jobs[]` — exported for fixture tests. */
export function parse(jobs, companyRef) {
  return (jobs || []).filter(j => j.id_icims || j.id).map(j => {
    const url = j.job_path ? `https://www.amazon.jobs${j.job_path}` : null;
    return normalizeJob({
      platform: 'amazon',
      companyToken: 'amazon',
      externalId: j.id_icims || j.id,
      company: companyRef.name || 'Amazon',
      title: j.title,
      location: j.normalized_location || j.location || null,
      url,
      applyUrl: url,
      description: cleanHtml([j.description, j.basic_qualifications, j.preferred_qualifications].filter(Boolean).join(' ')),
      postedAt: j.posted_date ? Date.parse(j.posted_date) : null, // "September 10, 2026"
      employmentType: j.job_schedule_type,
    });
  });
}

export async function fetchJobs(companyRef) {
  const { country = 'IND' } = readScanConfig(companyRef);
  const seen = new Map();
  for (const term of searchTerms(companyRef)) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await fetchJson(
        `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(term)}&country=${country}&result_limit=${PAGE}&offset=${page * PAGE}`,
        { headers: { Accept: 'application/json' } });
      const list = data?.jobs || [];
      for (const j of list) { const k = j.id_icims || j.id; if (k && !seen.has(k)) seen.set(k, j); }
      if (list.length < PAGE || (page + 1) * PAGE >= (data?.hits ?? 0)) break;
    }
  }
  const jobs = parse([...seen.values()], companyRef);
  jobs.partial = true;
  return jobs;
}
