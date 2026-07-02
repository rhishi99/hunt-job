import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

/** Pure parse — exported for fixture tests (no network). */
export function parse(data, companyRef) {
  const { slug, name, location } = companyRef;
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.map(j => normalizeJob({
    platform: 'ashby',
    companyToken: slug,
    externalId: j.id,
    company: name,
    title: j.title,
    location: j.location || location || null,
    url: j.jobUrl,
    applyUrl: j.applyUrl || j.jobUrl,
    description: cleanHtml(j.descriptionHtml || j.descriptionPlain || ''),
    postedAt: j.publishedAt ? new Date(j.publishedAt).getTime() : null,
  }));
}

export async function fetchJobs(companyRef) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${companyRef.slug}`);
  return parse(data, companyRef);
}
