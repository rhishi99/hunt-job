import 'dotenv/config';
import { createLogger } from './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('portalScanner');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Indian & global companies on Lever's public job board API ────────────────
const LEVER_COMPANIES = [
  // Indian product companies
  { name: 'Paytm',           slug: 'paytm',            location: 'Noida / Bangalore' },
  { name: 'Postman',         slug: 'postman',           location: 'Bangalore' },
  { name: 'Sprinklr',        slug: 'sprinklr',          location: 'Gurgaon' },
  { name: 'CleverTap',       slug: 'clevertap',         location: 'Mumbai / Bangalore' },
  { name: 'Chargebee',       slug: 'chargebee',         location: 'Chennai / Bangalore' },
  { name: 'BrowserStack',    slug: 'browserstack',      location: 'Mumbai' },
  { name: 'Freshworks',      slug: 'freshworks',        location: 'Chennai / Bangalore' },
  { name: 'Unacademy',       slug: 'unacademy',         location: 'Bangalore' },
  { name: 'Groww',           slug: 'groww',             location: 'Bangalore' },
  { name: 'Meesho',          slug: 'meesho',            location: 'Bangalore' },
  { name: 'CRED',            slug: 'cred',              location: 'Bangalore' },
  { name: 'Cashfree',        slug: 'cashfree',          location: 'Bangalore' },
  { name: 'Darwinbox',       slug: 'darwinbox',         location: 'Hyderabad' },
  { name: 'Zetwerk',         slug: 'zetwerk',           location: 'Bangalore' },
  { name: 'Slice',           slug: 'sliceit',           location: 'Bangalore' },
  { name: 'LeadSquared',     slug: 'leadsquared',       location: 'Bangalore' },
  { name: 'Juspay',          slug: 'juspay',            location: 'Bangalore' },
  { name: 'Hasura',          slug: 'hasura',            location: 'Bangalore' },
  { name: 'Exotel',          slug: 'exotel',            location: 'Bangalore' },
  { name: 'Ninjacart',       slug: 'ninjacart',         location: 'Bangalore' },
  { name: 'ShareChat',       slug: 'sharechat',         location: 'Bangalore' },
  { name: 'Niyo',            slug: 'niyo',              location: 'Bangalore' },
  { name: 'Licious',         slug: 'licious',           location: 'Bangalore' },
  { name: 'Vedantu',         slug: 'vedantu',           location: 'Bangalore' },
  { name: 'Pixis',           slug: 'pixis',             location: 'Bangalore' },
  { name: 'Whatfix',         slug: 'whatfix',           location: 'Bangalore' },
  { name: 'Setu',            slug: 'setu',              location: 'Bangalore' },
  { name: 'Jar',             slug: 'jar',               location: 'Bangalore' },
  { name: 'Rapido',          slug: 'rapido',            location: 'Bangalore' },
  { name: 'Dunzo',           slug: 'dunzo',             location: 'Bangalore' },
  { name: 'BharatPe',        slug: 'bharatpe',          location: 'Delhi / Bangalore' },
  { name: 'Lenskart',        slug: 'lenskart',          location: 'Gurugram' },
  { name: 'MoEngage',        slug: 'moengage',          location: 'Bangalore' },
  { name: 'Cars24',          slug: 'cars24',             location: 'Gurugram' },
  { name: 'Icertis',         slug: 'icertis',            location: 'Pune / Hyderabad' },
  { name: 'Jupiter Money',   slug: 'jupitermoney',       location: 'Bangalore' },
  { name: 'Porter',          slug: 'porter-in',          location: 'Bangalore' },
  { name: 'BlackBuck',       slug: 'blackbuck',          location: 'Bangalore' },
  { name: 'Cult.fit',        slug: 'curefit',            location: 'Bangalore' },
  { name: 'Shiprocket',      slug: 'shiprocket',         location: 'Delhi / Gurugram' },
  { name: 'Innovaccer',      slug: 'innovaccer',         location: 'Noida / Bangalore' },
  { name: 'NoBroker',        slug: 'nobroker',           location: 'Bangalore' },
  { name: 'Smallcase',       slug: 'smallcase',          location: 'Bangalore' },
  { name: 'Physics Wallah',  slug: 'physicswallah',      location: 'Noida' },
  { name: 'Fi Money',        slug: 'epifi',              location: 'Bangalore' },
  { name: 'Udaan',           slug: 'udaan',              location: 'Bangalore' },
  // Added: Indian product & SaaS
  { name: 'Yellow.ai',       slug: 'yellowai',           location: 'Bangalore' },
  { name: 'WebEngage',       slug: 'webengage',          location: 'Mumbai / Bangalore' },
  { name: 'Observe.AI',      slug: 'observeai',          location: 'Bangalore' },
  { name: 'Shadowfax',       slug: 'shadowfax',          location: 'Bangalore' },
  { name: 'Simpl',           slug: 'simpl',              location: 'Bangalore' },
  { name: 'LocoNav',         slug: 'loconav',            location: 'Delhi / Gurugram' },
  { name: 'Capillary Tech',  slug: 'capillary',          location: 'Bangalore' },
  { name: 'Tractable',       slug: 'tractable',          location: 'Gurugram' },
  { name: 'Mudrex',          slug: 'mudrex',             location: 'Bangalore' },
  { name: 'Khatabook',       slug: 'khatabook',          location: 'Bangalore' },
  { name: 'OKCredit',        slug: 'okcredit',           location: 'Bangalore' },
  { name: 'Stanza Living',   slug: 'stanzaliving',       location: 'Gurugram' },
  // Added: Global product companies with India engineering
  { name: 'Highspot',        slug: 'highspot',           location: 'Hyderabad' },
  { name: 'Samsara',         slug: 'samsara',            location: 'Bangalore / Hyderabad' },
  { name: 'Verkada',         slug: 'verkada',            location: 'Bangalore' },
];

// ── Greenhouse public board API ───────────────────────────────────────────────
const GREENHOUSE_COMPANIES = [
  // Indian product companies
  { name: 'Razorpay',        slug: 'razorpay',           location: 'Bangalore' },
  { name: 'Flipkart',        slug: 'flipkart',            location: 'Bangalore' },
  { name: 'Swiggy',          slug: 'swiggy',              location: 'Bangalore' },
  { name: 'PhonePe',         slug: 'phonepe',             location: 'Bangalore' },
  { name: 'Ola',             slug: 'olacabs',             location: 'Bangalore' },
  { name: 'Zomato',          slug: 'zomato',              location: 'Gurgaon' },
  { name: 'BigBasket',       slug: 'bigbasket',           location: 'Bangalore' },
  { name: 'Urban Company',   slug: 'urbancompany',        location: 'Gurgaon' },
  { name: 'Delhivery',       slug: 'delhivery',           location: 'Gurgaon' },
  { name: 'Dream11',         slug: 'dream11',             location: 'Mumbai' },
  { name: 'Nykaa',           slug: 'nykaa',               location: 'Mumbai' },
  { name: 'MPL',             slug: 'mpl',                 location: 'Bangalore' },
  { name: 'InMobi',          slug: 'inmobi',              location: 'Bangalore' },
  { name: 'Zepto',           slug: 'zepto',               location: 'Mumbai' },
  { name: 'Pocket FM',       slug: 'pocketfm',            location: 'Bangalore' },
  // Added: Indian product companies
  { name: 'Acko',            slug: 'acko',                location: 'Bangalore' },
  { name: 'Mobikwik',        slug: 'mobikwik',            location: 'Gurugram' },
  { name: 'Rupeek',          slug: 'rupeek',              location: 'Bangalore' },
  { name: 'Open Financial',  slug: 'open-financial',      location: 'Bangalore' },
  { name: 'Scaler',          slug: 'scaler',              location: 'Bangalore' },
  { name: 'Zetwerk',         slug: 'zetwerk',             location: 'Bangalore' },
  { name: 'Ecom Express',    slug: 'ecomexpress',         location: 'Delhi' },
  { name: 'Limeroad',        slug: 'limeroad',            location: 'Gurugram' },
  // Global product companies with India engineering
  { name: 'Thoughtworks',    slug: 'thoughtworks',        location: 'Bangalore / Pune' },
  { name: 'Stripe',          slug: 'stripe',              location: 'Bangalore' },
  { name: 'Cloudflare',      slug: 'cloudflare',          location: 'Bangalore' },
  { name: 'HubSpot',         slug: 'hubspot',             location: 'Bangalore' },
  { name: 'Zendesk',         slug: 'zendesk',             location: 'Bangalore / Pune' },
  { name: 'CrowdStrike',     slug: 'crowdstrike',         location: 'Bangalore / Pune' },
  { name: 'Okta',            slug: 'okta',                location: 'Bangalore / Hyderabad' },
  { name: 'Figma',           slug: 'figma',               location: 'Bangalore' },
  { name: 'Notion',          slug: 'notion',              location: 'Hyderabad' },
  { name: 'Coursera',        slug: 'coursera',            location: 'Bangalore / Gurugram' },
  { name: 'Reddit',          slug: 'reddit',              location: 'Bangalore' },
  { name: 'Amplitude',       slug: 'amplitude',           location: 'Bangalore' },
  { name: 'PagerDuty',       slug: 'pagerduty',           location: 'Bangalore' },
  { name: 'ThoughtSpot',     slug: 'thoughtspot',         location: 'Bangalore' },
  { name: 'New Relic',       slug: 'newrelic',            location: 'Bangalore' },
  { name: 'Datadog',         slug: 'datadoghq',           location: 'Bangalore' },
  { name: 'Grab',            slug: 'grab',                location: 'Bangalore' },
  { name: 'Revolut',         slug: 'revolut',             location: 'Bangalore / Chennai' },
  // Data / cloud infrastructure
  { name: 'MongoDB',         slug: 'mongodb',             location: 'Gurgaon / Bangalore' },
  { name: 'Elastic',         slug: 'elastic',             location: 'Bangalore' },
  { name: 'Confluent',       slug: 'confluent',           location: 'Pune / Bangalore' },
  { name: 'Nutanix',         slug: 'nutanix',             location: 'Bangalore / Pune' },
  { name: 'Snowflake',       slug: 'snowflake',           location: 'Bangalore' },
  { name: 'Databricks',      slug: 'databricks',          location: 'Bangalore' },
  { name: 'Airbnb',          slug: 'airbnb',              location: 'Gurgaon' },
  // Added: Global product with India offices
  { name: 'Asana',           slug: 'asana',               location: 'Bangalore' },
  { name: 'HashiCorp',       slug: 'hashicorp',           location: 'Bangalore / Hyderabad' },
  { name: 'Brex',            slug: 'brex',                location: 'Bangalore' },
  { name: 'Miro',            slug: 'realtimeboard',       location: 'Bangalore' },
  { name: 'Lattice',         slug: 'lattice',             location: 'Bangalore' },
  { name: 'Intercom',        slug: 'intercom',            location: 'Bangalore / Hyderabad' },
  { name: 'Rubrik',          slug: 'rubrik',              location: 'Bangalore / Pune' },
  { name: 'Plaid',           slug: 'plaid',               location: 'Bangalore' },
  { name: 'GitLab',          slug: 'gitlab',              location: 'Remote-India' },
  { name: 'Scale AI',        slug: 'scaleai',             location: 'Bangalore' },
  { name: 'Cohere',          slug: 'cohere',              location: 'Bangalore' },
  { name: 'Anthropic',       slug: 'anthropic',           location: 'Bangalore' },
];

const FETCH_TIMEOUT_MS = 30000;

const INDIA_LOCATION_KEYWORDS = [
  'india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'ncr', 'hyderabad',
  'pune', 'chennai', 'gurgaon', 'gurugram', 'noida', 'kolkata', 'ahmedabad',
  'jaipur', 'kochi', 'remote india', 'india remote',
];

function isIndiaLocation(location) {
  if (!location || location.trim() === '') return true; // no location = Indian company default
  const loc = location.toLowerCase();
  return INDIA_LOCATION_KEYWORDS.some(kw => loc.includes(kw));
}

function cleanHtml(s) {
  return (s || '')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
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

function jobMatchesArchetype(jobTitle, teamName, archetype) {
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

async function fetchWithTimeout(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) return null;
  return r.json();
}

function daysAgoLabel(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

async function scanLever(archetype, companies) {
  const results = await Promise.all(companies.map(async co => {
    try {
      const jobs = await fetchWithTimeout(`https://api.lever.co/v0/postings/${co.slug}?mode=json`);
      if (!Array.isArray(jobs)) return [];
      return jobs
        .filter(j => jobMatchesArchetype(j.text, j.categories?.team, archetype))
        .filter(j => isIndiaLocation(j.categories?.location))
        .map(j => ({
          title: j.text,
          company: co.name,
          location: j.categories?.location || co.location,
          url: j.hostedUrl,
          applyUrl: j.applyUrl,
          description: cleanHtml(j.description).slice(0, 400),
          source: 'lever',
          id: j.id,
          postedAt: j.createdAt || null,          // Unix ms from Lever API
          postedLabel: daysAgoLabel(j.createdAt),
        }));
    } catch { return []; }
  }));
  return results.flat();
}

async function scanGreenhouse(archetype, companies) {
  const results = await Promise.all(companies.map(async co => {
    try {
      const data = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${co.slug}/jobs`);
      if (!data?.jobs) return [];
      return data.jobs
        .filter(j => jobMatchesArchetype(j.title, j.departments?.[0]?.name, archetype))
        .filter(j => isIndiaLocation(j.location?.name))
        .map(j => {
          const postedMs = j.updated_at ? new Date(j.updated_at).getTime() : null;
          return {
            title: j.title,
            company: co.name,
            location: j.location?.name || co.location,
            url: j.absolute_url,
            applyUrl: j.absolute_url,
            description: `${j.title} at ${co.name} in ${j.location?.name || co.location}`,
            source: 'greenhouse',
            id: String(j.id),
            postedAt: postedMs,                   // converted to ms for uniform sorting
            postedLabel: daysAgoLabel(postedMs),
          };
        });
    } catch { return []; }
  }));
  return results.flat();
}

// All companies reachable via Lever / Greenhouse public APIs
export const SCANNABLE_COMPANIES = [
  ...LEVER_COMPANIES.map(c => ({ ...c, api: 'lever' })),
  ...GREENHOUSE_COMPANIES.map(c => ({ ...c, api: 'greenhouse' })),
];

class PortalScanner {
  constructor() {
    const portalsPath = path.join(__dirname, '../../config/company-portals.json');
    const portalsData = JSON.parse(fs.readFileSync(portalsPath, 'utf-8'));
    this.companies = portalsData.companies;
  }

  async scan(archetype, specificCompanies = null) {
    let leverCompanies = LEVER_COMPANIES;
    let ghCompanies = GREENHOUSE_COMPANIES;

    if (specificCompanies?.length) {
      const filter = specificCompanies.map(s => s.toLowerCase());
      leverCompanies = LEVER_COMPANIES.filter(c => filter.some(f => c.name.toLowerCase().includes(f) || c.slug.includes(f)));
      ghCompanies = GREENHOUSE_COMPANIES.filter(c => filter.some(f => c.name.toLowerCase().includes(f) || c.slug.includes(f)));
      // If nothing matched, scan all
      if (!leverCompanies.length && !ghCompanies.length) {
        leverCompanies = LEVER_COMPANIES;
        ghCompanies = GREENHOUSE_COMPANIES;
      }
    }

    process.stdout.write(`  Scanning ${leverCompanies.length + ghCompanies.length} company job boards...\n`);

    const [leverJobs, ghJobs] = await Promise.all([
      scanLever(archetype, leverCompanies),
      scanGreenhouse(archetype, ghCompanies),
    ]);

    const all = [...leverJobs, ...ghJobs]
      .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0)); // newest first

    const newCount = all.filter(j => j.postedAt && (Date.now() - j.postedAt) < 172800000).length; // < 48h
    process.stdout.write(`  Found ${all.length} matching jobs${newCount ? ` (${newCount} posted in last 48h 🔥)` : ''}.\n`);
    log.op('scan_done', { archetype, total: all.length, lever: leverJobs.length, greenhouse: ghJobs.length, new48h: newCount });
    return all;
  }

  getCompanies(filter = null) {
    if (!filter) return this.companies;
    return this.companies.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  }
}

export default PortalScanner;
