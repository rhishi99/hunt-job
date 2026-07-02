/**
 * normalize.js — NormalizedJob shape + shared pure helpers (moved from
 * portalScanner.js in the v2 revamp; re-exported there for back-compat).
 *
 * NormalizedJob: { id, company, title, location, url, applyUrl, description,
 *                  postedAt (unix ms|null), source }
 * id = "{platform}:{companyToken}:{externalId}"
 */

const INDIA_LOCATION_KEYWORDS = [
  'india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'ncr', 'hyderabad',
  'pune', 'chennai', 'gurgaon', 'gurugram', 'noida', 'kolkata', 'ahmedabad',
  'jaipur', 'kochi', 'remote india', 'india remote',
];

// Locations that look "remote" but are region-locked outside India
const EXCLUDE_LOCATION_KEYWORDS = [
  'north america', 'united states', ', us', '(us)', 'us only',
  'europe', 'emea', 'apac', 'united kingdom', ', uk',
  'canada', 'australia', 'germany', 'france',
];

export function isIndiaLocation(location) {
  if (!location || location.trim() === '') return true; // no location = Indian company default
  const loc = location.toLowerCase();

  // First: hard-exclude region-locked non-India remotes
  if (EXCLUDE_LOCATION_KEYWORDS.some(kw => loc.includes(kw))) return false;

  // Then: accept India cities / India-explicit keywords
  if (INDIA_LOCATION_KEYWORDS.some(kw => loc.includes(kw))) return true;

  // Catch-all: unqualified 'remote' / 'worldwide' / 'anywhere' that wasn't excluded above
  if (/\bremote\b|\bworldwide\b|\banywhere\b/.test(loc)) return true;

  return false;
}

/**
 * Strips HTML down to plain text. Handles both literal-tag HTML (Lever,
 * Recruitee, Ashby) and single-layer entity-encoded HTML (Greenhouse's
 * `content` field arrives as "&lt;div&gt;...&lt;/div&gt;") by decoding
 * entities BEFORE stripping tags.
 */
export function cleanHtml(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generic level/type words — not meaningful on their own for role matching
const GENERIC_WORDS = new Set(['engineer', 'developer', 'lead', 'manager', 'architect',
  'analyst', 'specialist', 'senior', 'junior', 'staff', 'principal', 'associate']);

// Role keyword synonyms — OR groups keyed by archetype word
const ROLE_SYNONYMS = {
  devops:      ['devops', 'dev ops', 'devsecops', 'ci/cd', 'cicd', 'release engineer'],
  sre:         ['sre', 'site reliability', 'reliability engineer'],
  platform:    ['platform engineer', 'platform sre', 'platform infra', 'platform team', 'infrastructure platform'],
  infra:       ['infrastructure', 'infra engineer', 'systems engineer', 'systems admin'],
  cloud:       ['cloud engineer', 'cloud architect', 'cloud platform', 'cloud infra', 'cloud operations', 'cloud native'],
  kubernetes:  ['kubernetes', 'k8s', 'container', 'openshift'],
  data:        ['data engineer', 'data platform', 'analytics engineer', 'etl', 'pipeline engineer', 'data infrastructure'],
  backend:     ['backend', 'back-end', 'server-side', 'api engineer', 'microservices'],
  frontend:    ['frontend', 'front-end', 'ui engineer', 'react', 'angular', 'vue'],
  fullstack:   ['fullstack', 'full-stack', 'full stack'],
  ml:          ['machine learning', 'ml engineer', 'ai engineer', 'mlops', 'model', 'llm', 'generative ai'],
  security:    ['security engineer', 'appsec', 'devsecops', 'cloud security', 'cybersecurity', 'infosec', 'vulnerability'],
  mobile:      ['mobile engineer', 'android', 'ios engineer', 'react native', 'flutter'],
  software:    ['software engineer', 'software developer', 'sde', 'swe'],
  product:     ['product manager', 'product management', 'pm '],
  architect:   ['solutions architect', 'enterprise architect', 'technical architect', 'cloud architect'],
  qa:          ['quality assurance', 'qa engineer', 'test engineer', 'sdet', 'automation engineer'],
};

export function jobMatchesArchetype(jobTitle, teamName, archetype) {
  const haystack = `${jobTitle} ${teamName || ''}`.toLowerCase();

  // 1. Full phrase match
  if (haystack.includes(archetype.toLowerCase())) return true;

  // 2. Check meaningful (non-generic) words — OR logic: any meaningful word matching = relevant
  const meaningful = archetype.toLowerCase().split(/\s+/).filter(w => !GENERIC_WORDS.has(w));
  if (!meaningful.length) return false;

  return meaningful.some(word => {
    const synonyms = ROLE_SYNONYMS[word] ?? [word];
    return synonyms.some(kw => haystack.includes(kw));
  });
}

export function daysAgoLabel(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export function makeJobId(platform, companyToken, externalId) {
  return `${platform}:${companyToken}:${externalId}`;
}

/** Builds a NormalizedJob from provider-supplied fields. */
export function normalizeJob({
  platform, companyToken, externalId, company, title, location, url, applyUrl, description, postedAt,
}) {
  return {
    id: makeJobId(platform, companyToken, externalId),
    company,
    title,
    location: location || null,
    url: url || null,
    applyUrl: applyUrl || url || null,
    description: description || '',
    postedAt: Number.isFinite(postedAt) ? postedAt : null,
    source: platform,
  };
}

export const NORMALIZED_JOB_KEYS = ['id', 'company', 'title', 'location', 'url', 'applyUrl', 'description', 'postedAt', 'source'];
