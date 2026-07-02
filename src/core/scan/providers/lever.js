import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

/** Pure parse — exported for fixture tests (no network). */
export function parse(jobs, companyRef) {
  const { slug, name, location } = companyRef;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(j => normalizeJob({
    platform: 'lever',
    companyToken: slug,
    externalId: j.id,
    company: name,
    title: j.text,
    location: j.categories?.location || location || null,
    url: j.hostedUrl,
    applyUrl: j.applyUrl,
    description: cleanHtml(j.description),
    postedAt: j.createdAt || null, // already unix ms
  }));
}

export async function fetchJobs(companyRef) {
  const data = await fetchJson(`https://api.lever.co/v0/postings/${companyRef.slug}?mode=json`);
  return parse(data, companyRef);
}
