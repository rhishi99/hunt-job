import { fetchJson } from '../httpClient.js';
import { normalizeJob } from '../normalize.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety cap — no company has 5000+ open India-relevant postings

/** Pure parse of one page's `content` array — exported for fixture tests (no network). */
export function parsePage(content, companyRef) {
  const { slug, name, location } = companyRef;
  if (!Array.isArray(content)) return [];
  return content.map(j => normalizeJob({
    platform: 'smartrecruiters',
    companyToken: slug,
    externalId: j.id,
    company: name,
    title: j.name,
    location: j.location?.fullLocation || location || null,
    url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
    applyUrl: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
    // The postings-list endpoint doesn't include a job description body —
    // build a useful summary from the metadata it does give us.
    description: [j.department?.label, j.function?.label, j.typeOfEmployment?.label, j.experienceLevel?.label]
      .filter(Boolean).join(' · ') || j.name,
    postedAt: j.releasedDate ? new Date(j.releasedDate).getTime() : null,
  }));
}

export async function fetchJobs(companyRef) {
  const { slug } = companyRef;
  const all = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?offset=${offset}&limit=${PAGE_SIZE}`);
    const content = data?.content;
    if (!Array.isArray(content) || content.length === 0) break;
    all.push(...content);
    offset += content.length;
    if (content.length < PAGE_SIZE || offset >= (data.totalFound ?? offset)) break;
  }
  return parsePage(all, companyRef);
}
