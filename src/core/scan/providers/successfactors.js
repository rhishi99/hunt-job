/**
 * successfactors.js — SAP SuccessFactors career sites (docs/fable51-answers.md §4.3 #3).
 * scan_config: { host, location? = 'India' }. List = server-rendered HTML
 * (`a.jobTitle-link[href="/job/{slug}/{id}/"]`, startrow paging); each job page carries
 * one JSON-LD JobPosting which providers/jsonld.js#parse already reads.
 * Detail fetches capped per scan. Keyword search => result.partial = true.
 */
import { fetchText } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';
import { readScanConfig, searchTerms } from '../scanConfig.js';
import { parse as parseJsonLd } from './jsonld.js';

export const needsSlug = false;

const PAGE = 25;
const MAX_PAGES = 2;
export const DETAIL_CAP = 50;

/** Pure: list HTML -> [{ href, id, title }]. Attribute-order agnostic. */
export function parseList(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1];
    if (!/jobTitle-link/.test(attrs)) continue;
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const id = href.replace(/\/+$/, '').split('/').pop();
    out.push({ href, id, title: cleanHtml(m[2]) });
  }
  return out;
}

/** Pure: one job's page HTML (+ list row fallback) -> NormalizedJob. */
export function parseJob(html, row, companyRef, host) {
  const url = `https://${host}${row.href}`;
  const ld = parseJsonLd(html, { ...companyRef, career_url: url })[0];
  return normalizeJob({
    platform: 'successfactors',
    companyToken: companyRef.slug || companyRef.name,
    externalId: row.id,
    company: ld?.company || companyRef.name,
    title: ld?.title || row.title,
    location: ld?.location || null,
    url,
    applyUrl: url,
    description: ld?.description || '',
    postedAt: ld?.postedAt ?? null,
    employmentType: ld?.employmentType,
  });
}

export async function fetchJobs(companyRef) {
  const cfg = readScanConfig(companyRef);
  if (!cfg.host) throw new Error('successfactors: scan_config needs {host}');
  const location = cfg.location ?? 'India';
  const rows = new Map();
  for (const term of searchTerms(companyRef)) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const html = await fetchText(
        `https://${cfg.host}/search/?q=${encodeURIComponent(term)}&locationsearch=${encodeURIComponent(location)}&startrow=${page * PAGE}`);
      const list = parseList(html);
      let fresh = 0;
      for (const r of list) if (!rows.has(r.href)) { rows.set(r.href, r); fresh++; }
      if (!fresh) break;
    }
  }
  const jobs = [];
  let n = 0;
  for (const row of rows.values()) {
    let html = '';
    if (n < DETAIL_CAP) {
      try { html = await fetchText(`https://${cfg.host}${row.href}`); n++; } catch { /* stub */ }
    }
    const job = parseJob(html, row, companyRef, cfg.host);
    if (!html) job.descriptionState = 'stub';
    jobs.push(job);
  }
  jobs.partial = true;
  return jobs;
}
