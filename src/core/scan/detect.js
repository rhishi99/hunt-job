/**
 * detect.js — ATS platform detection from a careers URL (plan §2.3).
 * Reuses src/core/autoFill/platformDetector.js's URL-pattern detection (the
 * one detector shared by scanner AND autofill), adds board-token extraction
 * on top, and falls back to a DOM fingerprint fetch when the URL alone
 * doesn't reveal the platform (e.g. a bare `careers.company.com`).
 */
import { detectPlatform } from '../autoFill/platformDetector.js';
import { fetchText } from './httpClient.js';

// Token-capture regexes per platform — only for ATSes scan/providers/*.js can
// actually scan. Platforms platformDetector.js knows about but we have no
// scan provider for (icims/taleo/jobvite/rippling) still get detected, just
// with token: null.
const TOKEN_PATTERNS = {
  greenhouse:      /(?:boards|job-boards)\.greenhouse\.io\/([a-zA-Z0-9-]+)/i,
  lever:           /jobs\.lever\.co\/([a-zA-Z0-9-]+)/i,
  ashby:           /jobs\.ashbyhq\.com\/([a-zA-Z0-9-]+)/i,
  smartrecruiters: /(?:careers|jobs)\.smartrecruiters\.com\/([a-zA-Z0-9-]+)/i,
  workday:         /([a-zA-Z0-9-]+)\.myworkdayjobs\.com/i,
};

// Platforms platformDetector.js doesn't cover yet, needed for scan providers.
const EXTRA_URL_PATTERNS = [
  { platform: 'recruitee', re: /([a-zA-Z0-9-]+)\.recruitee\.com/i },
  { platform: 'workable', re: /apply\.workable\.com\/([a-zA-Z0-9-]+)|([a-zA-Z0-9-]+)\.workable\.com/i },
];

/** URL-only detection. Returns { platform, token, method: 'url' } or null. */
export function detectFromUrl(url) {
  if (!url) return null;

  const platform = detectPlatform(url);
  if (platform !== 'generic') {
    const re = TOKEN_PATTERNS[platform];
    const m = re ? url.match(re) : null;
    return { platform, token: m?.[1] || null, method: 'url' };
  }

  for (const { platform: p, re } of EXTRA_URL_PATTERNS) {
    const m = url.match(re);
    if (m) return { platform: p, token: m[1] || m[2] || null, method: 'url' };
  }

  return null;
}

const DOM_FINGERPRINTS = [
  { platform: 'greenhouse', needles: ['window._grnhse', 'boards.greenhouse.io', 'greenhouse.io'] },
  { platform: 'lever', needles: ['window.Lever', 'jobs.lever.co'] },
  { platform: 'ashby', needles: ['ashbyhq.com', 'ashby_embed'] },
  { platform: 'smartrecruiters', needles: ['smartrecruiters.com'] },
  { platform: 'workday', needles: ['data-workday', 'myworkdayjobs.com'] },
  { platform: 'recruitee', needles: ['recruitee.com'] },
  { platform: 'workable', needles: ['workable.com'] },
];

/** DOM fingerprint fallback — fetches the page and greps for known markers. */
export async function detectFromPage(url) {
  let html;
  try {
    html = await fetchText(url);
  } catch {
    return null;
  }
  if (!html) return null;
  for (const { platform, needles } of DOM_FINGERPRINTS) {
    if (needles.some(n => html.includes(n))) return { platform, token: null, method: 'dom' };
  }
  return null;
}

/** Full detection: URL regex first, DOM fingerprint fetch as fallback. */
export async function detect(url) {
  return detectFromUrl(url) || (await detectFromPage(url)) || { platform: null, token: null, method: 'none' };
}
