import { fetchJson } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

function parseRecruiteeDate(s) {
  if (!s) return null;
  // "2026-07-02 13:47:28 UTC" -> ISO
  const iso = s.replace(' UTC', 'Z').replace(' ', 'T');
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Pure parse — exported for fixture tests (no network). */
export function parse(data, companyRef) {
  const { slug, name, location } = companyRef;
  const offers = data?.offers;
  if (!Array.isArray(offers)) return [];
  return offers.map(j => normalizeJob({
    platform: 'recruitee',
    companyToken: slug,
    externalId: String(j.id),
    company: name,
    title: j.title,
    location: j.location || location || null,
    url: j.careers_url,
    applyUrl: j.careers_apply_url || j.careers_url,
    description: cleanHtml(j.description || ''),
    postedAt: parseRecruiteeDate(j.published_at) ?? parseRecruiteeDate(j.created_at),
  }));
}

export async function fetchJobs(companyRef) {
  const data = await fetchJson(`https://${companyRef.slug}.recruitee.com/api/offers/`);
  return parse(data, companyRef);
}
