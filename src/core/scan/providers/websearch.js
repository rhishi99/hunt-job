/**
 * websearch.js — LinkedIn job LINK discovery via web search (aggregator provider).
 *
 * LinkedIn is never fetched. We ask a search engine for
 * `site:linkedin.com/jobs/view "<archetype>" India` and keep only what the
 * result itself carries: URL, title, snippet. Company/location are guessed from
 * the result title ("Role - Company - Location | LinkedIn"). Descriptions are
 * stubs (snippet only) and commitment is left unknown unless the TITLE says so.
 *
 * Backends, in order:
 *   1. Google Programmable Search JSON API — env GOOGLE_CSE_KEY + GOOGLE_CSE_CX.
 *      Free tier is 100 queries/day; the key MUST come from a GCP project with
 *      NO billing account linked (linking one deletes the free tier).
 *   2. DuckDuckGo HTML endpoint, regex-parsed, with a polite delay.
 *
 * Aggregator shape: company_id = source row, jobs.employer = guessed hirer.
 * Search results can never prove a posting is gone, so every feed is `partial`
 * (scan/index.js then skips the NOT-IN soft-close sweep).
 * Scan interval (6h) is enforced in scan/index.js MIN_SCAN_INTERVAL_MS.
 */
import { fetchJson, fetchText } from '../httpClient.js';
import { normalizeJob } from '../normalize.js';

export const needsSlug = false;

// Google free tier = 100/day; 6h interval => 4 scans/day => 12 queries/scan = 48/day.
export const MAX_QUERIES = 12;
const DDG_DELAY_MS = 4000;
const DDG_URL = 'https://html.duckduckgo.com/html/?q=';
const GOOGLE_URL = 'https://www.googleapis.com/customsearch/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Two queries per archetype (India + remote), capped. Pure. */
export function buildQueries(archetypes = [], max = MAX_QUERIES) {
  const qs = [];
  for (const a of archetypes) {
    const name = String(a || '').trim();
    if (!name) continue;
    qs.push(`site:linkedin.com/jobs/view "${name}" India`);
    qs.push(`site:linkedin.com/jobs/view "${name}" remote`);
  }
  return qs.slice(0, max);
}

// Target: senior-and-up DevOps roles with 10+ years, in four cities.
export const TARGET_TITLES = ['Senior DevOps Engineer', 'Lead DevOps Engineer', 'DevOps Architect', 'DevOps Manager'];
export const TARGET_CITIES = ['Pune', 'Mumbai', 'Bangalore', 'Hyderabad', 'Remote'];
export const MIN_YEARS = 10;
const MAX_TARGET_QUERIES = TARGET_TITLES.length * TARGET_CITIES.length;

const SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff|architect|manager|head|director)\b/i;
const JUNIOR_RE = /\b(fresher|freshers|junior|jr\.?|intern|internship|trainee|graduate|entry[- ]level|associate)\b/i;
const CITY_RE = /\b(remote|work from home|wfh|pune|mumbai|navi mumbai|thane|bangalore|bengaluru|hyderabad|secunderabad)\b/i;

/** One query per title x city (16), so results are already scoped before filtering. Pure. */
export function buildTargetQueries(titles = TARGET_TITLES, cities = TARGET_CITIES, max = MAX_TARGET_QUERIES) {
  const qs = [];
  for (const t of titles) for (const c of cities) qs.push(`site:linkedin.com/jobs/view "${t}" ${c}`);
  return qs.slice(0, max);
}

/**
 * Pure: does a search hit fit the target? Title must be senior+ and not junior;
 * a stated location must be one of the four cities or remote, anywhere in the
 * world (on-site abroad, e.g. Malaysia, fails; unknown location passes because
 * the query itself was city-scoped); if the snippet states years of experience,
 * the highest number stated must reach MIN_YEARS ("8-12 years" passes, "5+" fails).
 * Also drops non-Latin titles (e.g. Hebrew/Arabic pages).
 */
export function isTargetJob({ title, location, snippet } = {}) {
  const t = String(title || '');
  if (!t || /[^\u0000-ɏ -⁯]/.test(t)) return false;
  if (JUNIOR_RE.test(t) || !SENIOR_RE.test(t)) return false;
  if (location && !CITY_RE.test(location)) return false;
  const years = [...String(snippet || '').matchAll(/(\d{1,2})\s*(?:\+|-\s*\d{1,2}|to\s*\d{1,2})?\s*(?:years|yrs)/gi)]
    .flatMap(m => m[0].match(/\d{1,2}/g).map(Number));
  if (years.length && Math.max(...years) < MIN_YEARS) return false;
  return true;
}

/** https://in.linkedin.com/jobs/view/senior-dev-at-acme-3812345678?x=1 -> https://www.linkedin.com/jobs/view/3812345678. Null if not a job view URL. */
export function canonicalLinkedInUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/jobs\/view\/(?:[^/]*?-)?(\d{6,})\/?$/);
  return m ? `https://www.linkedin.com/jobs/view/${m[1]}` : null;
}

/** Guess {title, company, location} from a result title. Pure. */
export function parseResultTitle(raw) {
  const t = String(raw || '').replace(/\s*[|·]\s*LinkedIn(?: Jobs)?\s*$/i, '').trim();
  // "Company hiring Role in Location"
  const h = t.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$/i);
  if (h) return { title: h[2].trim(), company: h[1].trim(), location: h[3]?.trim() || null };
  // "Role - Company - Location"
  const parts = t.split(/\s+[-–—]\s+/);
  // "Role at Company[ - Location]"
  const at = parts[0].match(/^(.+?)\s+at\s+(.+)$/i);
  if (at && parts.length <= 2) return { title: at[1].trim(), company: at[2].trim(), location: parts[1] || null };
  if (parts.length >= 3) return { title: parts[0], company: parts[1], location: parts.slice(2).join(' - ') };
  if (parts.length === 2) return { title: parts[0], company: parts[1], location: null };
  return { title: t, company: null, location: null };
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x2F;/g, '/');
}
const stripTags = s => decodeEntities(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Unwrap DDG's //duckduckgo.com/l/?uddg=<encoded> redirect. */
function unwrapDdg(href) {
  const h = decodeEntities(href);
  const m = h.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return null; } }
  return h.startsWith('//') ? `https:${h}` : h;
}

/** Pure: DuckDuckGo HTML -> [{url,title,snippet}] (raw, unfiltered). */
export function parseDdgHtml(html) {
  const out = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="[^"]*result__a|$)/g;
  let m;
  while ((m = re.exec(html || ''))) {
    const sn = m[3].match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    out.push({ url: unwrapDdg(m[1]), title: stripTags(m[2]), snippet: sn ? stripTags(sn[1]) : '' });
  }
  return out;
}

/** Pure: Google CSE JSON -> [{url,title,snippet}]. */
export function parseGoogleJson(data) {
  if (!Array.isArray(data?.items)) return [];
  return data.items.map(i => ({ url: i.link, title: i.title || '', snippet: i.snippet || '' }));
}

/** Pure: raw hits -> NormalizedJobs, LinkedIn job-view URLs only, deduped by canonical URL. */
export function parse(hits, companyRef = {}) {
  const seen = new Set();
  const jobs = [];
  for (const h of hits || []) {
    const url = canonicalLinkedInUrl(h.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const g = parseResultTitle(h.title);
    jobs.push(normalizeJob({
      platform: 'linkedin-search',
      companyToken: companyRef.slug || 'linkedin-search',
      externalId: url.split('/').pop(),
      company: g.company || 'LinkedIn',
      employer: g.company,
      title: g.title,
      location: g.location,
      url,
      applyUrl: url,
      description: h.snippet || '', // stub: snippet only
      postedAt: null,
      employmentType: null, // unknown; normalizeJob may still read an explicit title label
    }));
  }
  return jobs;
}

export function hasGoogleCreds(env = process.env) {
  return !!(env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX);
}

export async function fetchJobs(companyRef = {}) {
  const queries = buildTargetQueries();
  const useGoogle = hasGoogleCreds();
  const hits = [];
  let ok = 0;
  let lastErr = null;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      if (useGoogle) {
        const url = `${GOOGLE_URL}?key=${encodeURIComponent(process.env.GOOGLE_CSE_KEY)}` +
          `&cx=${encodeURIComponent(process.env.GOOGLE_CSE_CX)}&num=10&q=${encodeURIComponent(q)}`;
        hits.push(...parseGoogleJson(await fetchJson(url)));
      } else {
        if (i > 0) await sleep(DDG_DELAY_MS);
        const html = await fetchText(DDG_URL + encodeURIComponent(q), { headers: { 'User-Agent': UA } });
        hits.push(...parseDdgHtml(html));
      }
      ok++;
    } catch (err) {
      lastErr = err;
    }
  }
  if (queries.length && !ok) throw lastErr; // every query failed: real error, not "0 jobs"
  const jobs = parse(hits, companyRef).filter(j => isTargetJob({ title: j.title, location: j.location, snippet: j.description }));
  jobs.partial = true; // search results can't prove absence
  return jobs;
}
