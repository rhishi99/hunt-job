/**
 * jsonld.js — schema.org JobPosting fallback provider (plan §2.2 step 2 /
 * §2.4). Used for companies whose ATS isn't one of the direct API providers
 * (ats_platform === 'jsonld', assigned by detect.js/audit-portals, or set
 * manually): fetch the career page HTML and read the JSON-LD JobPosting
 * markup most ATSes (even Workday/iCIMS) inject for Google Jobs SEO.
 *
 * ponytail: not wired into scan/index.js's `loadEnabledCompanies` query —
 * that still requires an explicit ats_platform. Auto-routing every
 * unknown/career_url-only company through this fallback is real HTTP traffic
 * against ~190 live sites and belongs with the rest of the §2.2 fallback
 * chain (sitemap/RSS/Playwright), not this phase. Add when detect.js/
 * audit-portals starts assigning 'jsonld' automatically.
 */
import crypto from 'crypto';
import { fetchText } from '../httpClient.js';
import { cleanHtml, normalizeJob } from '../normalize.js';

const JSONLD_BLOCK_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function extractJsonLdBlocks(html) {
  const blocks = [];
  let m;
  JSONLD_BLOCK_RE.lastIndex = 0;
  while ((m = JSONLD_BLOCK_RE.exec(html || ''))) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      // malformed block — skip, don't fail the whole page
    }
  }
  return blocks;
}

function isJobPostingType(type) {
  return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
}

/** Walks a parsed JSON-LD document, handling @graph arrays and plain arrays/objects. */
function collectJobPostings(blocks) {
  const postings = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (Array.isArray(node['@graph'])) { node['@graph'].forEach(visit); return; }
    if (isJobPostingType(node['@type'])) postings.push(node);
  };
  blocks.forEach(visit);
  return postings;
}

function locationFromJobPosting(jp) {
  const jl = Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation;
  const addr = jl?.address;
  if (!addr) return null;
  return [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ') || null;
}

function hashUrl(s) {
  return crypto.createHash('sha256').update(s || '').digest('hex').slice(0, 16);
}

/** Pure parse — exported for fixture tests (no network). */
export function parse(html, companyRef) {
  const { slug, name, career_url: careerUrl } = companyRef;
  const postings = collectJobPostings(extractJsonLdBlocks(html));
  return postings
    .filter(jp => jp.title)
    .map(jp => {
      const url = jp.url || careerUrl || '';
      return normalizeJob({
        platform: 'jsonld',
        companyToken: slug || name,
        externalId: hashUrl(url || jp.title),
        company: jp.hiringOrganization?.name || name,
        title: jp.title,
        location: locationFromJobPosting(jp),
        url,
        applyUrl: url,
        description: cleanHtml(jp.description || ''),
        postedAt: jp.datePosted ? new Date(jp.datePosted).getTime() : null,
      });
    });
}

export async function fetchJobs(companyRef) {
  if (!companyRef.career_url) return [];
  const html = await fetchText(companyRef.career_url);
  return parse(html, companyRef);
}
