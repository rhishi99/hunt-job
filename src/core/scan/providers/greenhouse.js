import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

/** Pure parse — exported for fixture tests (no network). */
export function parse(data, companyRef) {
  const { slug, name, location } = companyRef;
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(j => normalizeJob({
    platform: 'greenhouse',
    companyToken: slug,
    externalId: String(j.id),
    company: name,
    title: j.title,
    location: j.location?.name || location || null,
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    description: cleanHtml(j.content) || `${j.title} at ${name}`,
    postedAt: j.updated_at ? new Date(j.updated_at).getTime() : null,
  }));
}

export async function fetchJobs(companyRef) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${companyRef.slug}/jobs?content=true`);
  return parse(data, companyRef);
}
