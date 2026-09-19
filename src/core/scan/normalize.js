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
  'analyst', 'specialist', 'senior', 'junior', 'staff', 'principal', 'associate', 'engineering']);

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

  // 2. Word-level match. AND semantics (B-08): every meaningful word of a
  // multi-word archetype must hit, so "Data Platform Engineer" no longer matches
  // any "data" posting. When EVERY word is generic ("Engineering Manager") there is
  // nothing distinctive to key on, so fall back to requiring all tokens instead of
  // returning false (which used to leave only the exact-phrase path).
  const tokens = archetype.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const meaningful = tokens.filter(w => !GENERIC_WORDS.has(w));
  const required = meaningful.length ? meaningful : tokens;

  return required.every(word => {
    const synonyms = ROLE_SYNONYMS[word] ?? [word];
    return synonyms.some(kw => haystack.includes(kw));
  });
}

// ── employment type / commitment ─────────────────────────────────────────────
// Providers each spell this differently (Ashby "PartTime", Lever "Part-time",
// schema.org "PART_TIME", Recruitee "parttime_permanent", Remotive "part_time").
// Everything collapses to this small vocabulary before it reaches the DB.
export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'temporary'];

// Order matters: 'part-time' must be tested before 'time', 'contract' before 'temp'.
const EMPLOYMENT_TYPE_PATTERNS = [
  ['part-time',  /\bpart[\s._-]?time\b|\bparttime\b/],
  ['internship', /\bintern(ship)?\b|\btrainee\b|\bapprentice(ship)?\b/],
  ['contract',   /\bcontract(or|ors|ing)?\b|\bfreelance\b|\bb2b\b|\bc2c\b|\bstatement of work\b/],
  ['temporary',  /\btemp(orary)?\b|\bseasonal\b|\bfixed[\s._-]?term\b|\binterim\b/],
  ['full-time',  /\bfull[\s._-]?time\b|\bfulltime\b|\bpermanent\b/],
];

// Deliberately NOT matched, after each produced false positives on live data:
//   \bpt\b / \bft\b  — hit internal product codes ("Maintenance Manager_HzP/TEF3_PT")
//   \bconsultant\b   — a job title at consultancies ("SAP Controlling Consultant"),
//                      not a statement about commitment
//   \bsow\b          — collides with ordinary words once underscores become spaces
// Under-matching is the right failure mode here: a missed gig costs one listing,
// a false positive costs a wasted application.

/**
 * Collapses any provider's employment-type string onto EMPLOYMENT_TYPES.
 * Returns null when the input carries no usable signal — callers should then
 * fall back to guessEmploymentType() rather than assuming full-time, because
 * "unknown" and "full-time" are different things when filtering for gigs.
 */
export function normalizeEmploymentType(raw) {
  if (!raw) return null;
  // Underscores are word characters, so Recruitee's "parttime_permanent" would
  // defeat the \bparttime\b boundary — split them into spaces first.
  const s = String(raw).toLowerCase().replace(/_/g, ' ');
  for (const [type, re] of EMPLOYMENT_TYPE_PATTERNS) if (re.test(s)) return type;
  return null;
}

/**
 * Last-resort inference from free text, for providers with no structured field
 * (Greenhouse, RemoteOK, WeWorkRemotely) or postings that simply omit it.
 *
 * Only the TITLE is trusted for a positive match. Descriptions mention
 * "contract" and "part-time" constantly in boilerplate ("contract of
 * employment", "part-time employees are eligible for..."), which produced
 * false positives, so the description is consulted only via a tightly-anchored
 * "Employment type: X" / "Job type: X" label.
 */
export function guessEmploymentType(title, description) {
  const fromTitle = normalizeEmploymentType(title);
  if (fromTitle) return fromTitle;

  const labelled = String(description || '')
    .match(/\b(?:employment|job|contract|position)\s*type\s*[:\-–]\s*([a-z\s._-]{2,20})/i);
  return labelled ? normalizeEmploymentType(labelled[1]) : null;
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
  employmentType, employer,
}) {
  // Prefer the provider's structured field; fall back to inference only when absent.
  const commitment = normalizeEmploymentType(employmentType) ?? guessEmploymentType(title, description);
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
    employmentType: commitment,
    employer: employer || null,
  };
}

export const NORMALIZED_JOB_KEYS = ['id', 'company', 'title', 'location', 'url', 'applyUrl', 'description', 'postedAt', 'source', 'employmentType', 'employer'];
