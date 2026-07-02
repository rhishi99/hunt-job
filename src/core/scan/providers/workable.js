import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

// ponytail: the captured fixture (test/fixtures/ats/workable.json) has an
// empty `jobs` array, so field names below follow Workable's documented
// widget API (title/shortcode/url/application_url/department/published_on)
// with defensive fallbacks rather than a verified real sample. Tighten once
// a live company with open Workable postings is found.
function buildLocation(j) {
  const city = j.city || j.location?.city;
  if (!city) return null;
  return [city, j.state || j.location?.region, j.country || j.location?.country].filter(Boolean).join(', ');
}

/** Pure parse — exported for fixture tests (no network). */
export function parse(data, companyRef) {
  const { slug, name, location } = companyRef;
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(j => normalizeJob({
    platform: 'workable',
    companyToken: slug,
    externalId: j.shortcode || j.id || j.code,
    company: name,
    title: j.title,
    location: buildLocation(j) || location || null,
    url: j.url || j.shortlink,
    applyUrl: j.application_url || j.url || j.shortlink,
    description: cleanHtml(j.description || j.full_description || '') || j.title,
    postedAt: j.published_on ? new Date(j.published_on).getTime() : (j.created_at ? new Date(j.created_at).getTime() : null),
  }));
}

export async function fetchJobs(companyRef) {
  const data = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${companyRef.slug}`);
  return parse(data, companyRef);
}
