/**
 * platformDetector.js
 * Identifies the ATS platform from a job URL.
 * Returns a platform key used to select the right adapter.
 */

const PLATFORM_PATTERNS = [
  { key: 'workday',          patterns: ['myworkdayjobs.com', 'workday.com/en-US', 'wd3.myworkdayjobs', 'wd1.myworkdayjobs', 'wd5.myworkdayjobs'] },
  { key: 'lever',            patterns: ['jobs.lever.co', 'lever.co/'] },
  { key: 'greenhouse',       patterns: ['boards.greenhouse.io', 'greenhouse.io/'] },
  { key: 'smartrecruiters',  patterns: ['jobs.smartrecruiters.com', 'smartrecruiters.com/'] },
  { key: 'icims',            patterns: ['icims.com/', 'careers.icims.com'] },
  { key: 'taleo',            patterns: ['taleo.net/', 'tbe.taleo.net', 'oracle.taleo.net'] },
  { key: 'jobvite',          patterns: ['jobs.jobvite.com', 'hire.jobvite.com'] },
  { key: 'ashby',            patterns: ['jobs.ashbyhq.com', 'ashbyhq.com/'] },
  { key: 'rippling',         patterns: ['jobs.rippling.com', 'rippling.com/jobs'] },
];

/**
 * Detect platform from URL string.
 * @param {string} url
 * @returns {'workday'|'lever'|'greenhouse'|'smartrecruiters'|'icims'|'taleo'|'jobvite'|'ashby'|'rippling'|'generic'}
 */
export function detectPlatform(url) {
  if (!url) return 'generic';
  const lower = url.toLowerCase();
  for (const { key, patterns } of PLATFORM_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return 'generic';
}

/**
 * Normalise a job URL to the actual application form URL.
 * Some platforms require a suffix to reach the form.
 */
export function getApplyUrl(url, platform) {
  if (!url) return url;
  switch (platform) {
    case 'lever': {
      const base = url.split('?')[0].replace(/\/apply$/, '');
      return `${base}/apply`;
    }
    case 'greenhouse': {
      return url.split('#')[0] + '#app';
    }
    default:
      return url;
  }
}

export const PLATFORM_DISPLAY_NAMES = {
  workday:         'Workday',
  lever:           'Lever',
  greenhouse:      'Greenhouse',
  smartrecruiters: 'SmartRecruiters',
  icims:           'iCIMS',
  taleo:           'Taleo',
  jobvite:         'Jobvite',
  ashby:           'Ashby',
  rippling:        'Rippling',
  generic:         'Generic (AI-assisted)',
};
