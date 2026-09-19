/**
 * workday.js — Workday public CXS JSON API (docs/fable51-answers.md §4.3 #1).
 * Coordinates live in companies.scan_config: { tenant, wd, site, host?, prefix? }.
 *   list:   POST https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 *   detail: GET  …/wday/cxs/{tenant}/{site}{externalPath}
 * List rows carry no description, so detail is fetched lazily: only for India-ish or
 * ambiguous ("2 Locations") rows, capped. Everything else is a stub
 * (description '', descriptionState 'stub') for a later hydrate task.
 * The feed is keyword-search based, so absence proves nothing => result.partial = true.
 */
import { fetchJson } from '../httpClient.js';
import { cleanHtml, isIndiaLocation, normalizeJob } from '../normalize.js';
import { readScanConfig, searchTerms } from '../scanConfig.js';

export const needsSlug = false;

const PAGE = 20;
const MAX_PAGES = 3;
export const DETAIL_CAP = 40;

/** "Posted 10 Days Ago" -> ms; "Posted Today"/"Yesterday"; "30+ Days Ago"/unknown -> null. */
export function parsePostedOn(s, now = Date.now()) {
  if (!s) return null;
  const t = String(s).toLowerCase();
  if (t.includes('30+')) return null;
  if (t.includes('today')) return now;
  if (t.includes('yesterday')) return now - 86400000;
  const m = t.match(/(\d+)\s+days?\s+ago/);
  return m ? now - Number(m[1]) * 86400000 : null;
}

function coords(companyRef) {
  const cfg = readScanConfig(companyRef);
  const { tenant, wd, site } = cfg;
  if (!tenant || !site) throw new Error('workday: scan_config needs {tenant, site[, wd|host]}');
  const host = cfg.host || `${tenant}.${wd}.myworkdayjobs.com`;
  return { tenant, site, host, prefix: cfg.prefix || '' };
}

const isAmbiguousLocation = loc => /^\d+\s+locations?$/i.test((loc || '').trim());

/** Pure: list postings (already de-duplicated) + detail map -> NormalizedJob[]. */
export function parse(postings, companyRef, details = {}) {
  const { name } = companyRef;
  const { tenant, site, host, prefix } = coords(companyRef);
  return postings.map(p => {
    const d = details[p.externalPath]?.jobPostingInfo;
    const externalId = p.bulletFields?.[0] || d?.jobReqId || p.externalPath.split('_').pop();
    const url = `https://${host}${prefix}/${site}${p.externalPath}`;
    const extra = Array.isArray(d?.additionalLocations) ? d.additionalLocations : [];
    const location = d
      ? [d.location, ...extra].filter(Boolean).join('; ') || p.locationsText
      : p.locationsText;
    const job = normalizeJob({
      platform: 'workday',
      companyToken: tenant,
      externalId,
      company: name,
      title: p.title,
      location,
      url,
      applyUrl: url,
      description: d ? cleanHtml(d.jobDescription) : '',
      postedAt: parsePostedOn(p.postedOn),
      employmentType: d?.timeType, // "Full time" | "Part time"
    });
    job.descriptionState = d ? 'full' : 'stub';
    return job;
  });
}

export async function fetchJobs(companyRef) {
  const { tenant, site, host } = coords(companyRef);
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  const byPath = new Map();

  for (const term of searchTerms(companyRef)) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await fetchJson(`${base}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE, offset: page * PAGE, searchText: term }),
      });
      const rows = data?.jobPostings || [];
      for (const r of rows) if (r.externalPath && !byPath.has(r.externalPath)) byPath.set(r.externalPath, r);
      if (rows.length < PAGE || (page + 1) * PAGE >= (data?.total ?? 0)) break;
    }
  }

  const postings = [...byPath.values()];
  const details = {};
  let n = 0;
  for (const p of postings) {
    if (n >= DETAIL_CAP) break;
    const wanted = (p.locationsText && isIndiaLocation(p.locationsText)) || isAmbiguousLocation(p.locationsText);
    if (!wanted) continue;
    try {
      details[p.externalPath] = await fetchJson(`${base}${p.externalPath}`, { headers: { Accept: 'application/json' } });
      n++;
    } catch { /* stub row; hydrate later */ }
  }

  const jobs = parse(postings, companyRef, details);
  jobs.partial = true;
  return jobs;
}
