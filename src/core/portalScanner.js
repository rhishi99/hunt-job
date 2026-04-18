import 'dotenv/config';
import { createLogger } from './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('portalScanner');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Indian companies with public Lever job boards
const LEVER_COMPANIES = [
  { name: 'Paytm',        slug: 'paytm',         location: 'Noida / Bengaluru' },
  { name: 'Dunzo',        slug: 'dunzo',          location: 'Bangalore' },
  { name: 'Postman',      slug: 'postman',        location: 'Bangalore' },
  { name: 'Sprinklr',     slug: 'sprinklr',       location: 'Gurgaon' },
  { name: 'Clevertap',    slug: 'clevertap',      location: 'Mumbai / Bangalore' },
  { name: 'Chargebee',    slug: 'chargebee',      location: 'Chennai / Bangalore' },
  { name: 'Browserstack', slug: 'browserstack',   location: 'Mumbai' },
  { name: 'Freshworks',   slug: 'freshworks',     location: 'Chennai / Bangalore' },
  { name: 'Unacademy',    slug: 'unacademy',      location: 'Bangalore' },
  { name: 'Groww',        slug: 'groww',          location: 'Bangalore' },
  { name: 'Meesho',       slug: 'meesho',         location: 'Bangalore' },
  { name: 'CRED',         slug: 'cred',           location: 'Bangalore' },
  { name: 'Cashfree',     slug: 'cashfree',       location: 'Bangalore' },
  { name: 'Darwinbox',    slug: 'darwinbox',      location: 'Hyderabad' },
  { name: 'Zetwerk',      slug: 'zetwerk',        location: 'Bangalore' },
  { name: 'Slice',        slug: 'sliceit',        location: 'Bangalore' },
  { name: 'Leadsquared',  slug: 'leadsquared',    location: 'Bangalore' },
  { name: 'Juspay',       slug: 'juspay',         location: 'Bangalore' },
  { name: 'Hasura',       slug: 'hasura',         location: 'Bangalore' },
  { name: 'Exotel',       slug: 'exotel',         location: 'Bangalore' },
  { name: 'Ninjacart',    slug: 'ninjacart',      location: 'Bangalore' },
  { name: 'Sharechat',    slug: 'sharechat',      location: 'Bangalore' },
  { name: 'Niyo',         slug: 'niyo',           location: 'Bangalore' },
  { name: 'Licious',      slug: 'licious',        location: 'Bangalore' },
  { name: 'Vedantu',      slug: 'vedantu',        location: 'Bangalore' },
  { name: 'Pixis',        slug: 'pixis',          location: 'Bangalore' },
  { name: 'Whatfix',      slug: 'whatfix',        location: 'Bangalore' },
  { name: 'Setu',         slug: 'setu',           location: 'Bangalore' },
  { name: 'Jar',          slug: 'jar',            location: 'Bangalore' },
  { name: 'Rapido',       slug: 'rapido',         location: 'Bangalore' },
];

// Greenhouse companies
const GREENHOUSE_COMPANIES = [
  { name: 'Razorpay',      slug: 'razorpay',        location: 'Bangalore' },
  { name: 'Flipkart',      slug: 'flipkart',         location: 'Bangalore' },
  { name: 'Swiggy',        slug: 'swiggy',           location: 'Bangalore' },
  { name: 'PhonePe',       slug: 'phonepe',          location: 'Bangalore' },
  { name: 'Ola',           slug: 'olacabs',          location: 'Bangalore' },
  { name: 'Zomato',        slug: 'zomato',           location: 'Gurgaon' },
  { name: 'BigBasket',     slug: 'bigbasket',        location: 'Bangalore' },
  { name: 'Urban Company', slug: 'urbancompany',     location: 'Gurgaon' },
  { name: 'Delhivery',     slug: 'delhivery',        location: 'Gurgaon' },
  { name: 'Dream11',       slug: 'dream11',          location: 'Mumbai' },
  { name: 'Nykaa',         slug: 'nykaa',            location: 'Mumbai' },
  { name: 'MPL',           slug: 'mpl',              location: 'Bangalore' },
  { name: 'InMobi',        slug: 'inmobi',           location: 'Bangalore' },
  { name: 'Zepto',         slug: 'zepto',            location: 'Mumbai' },
  { name: 'Pocket FM',     slug: 'pocketfm',         location: 'Bangalore' },
  { name: 'Thoughtworks',  slug: 'thoughtworks',     location: 'Bangalore' },
  { name: 'MongoDB',       slug: 'mongodb',          location: 'Gurgaon' },
  { name: 'Elastic',       slug: 'elastic',          location: 'Bangalore' },
  { name: 'Confluent',     slug: 'confluent',        location: 'Pune' },
  { name: 'Nutanix',       slug: 'nutanix',          location: 'Bangalore' },
  { name: 'Snowflake',     slug: 'snowflake',        location: 'Bangalore' },
  { name: 'Databricks',    slug: 'databricks',       location: 'Bangalore' },
];

const FETCH_TIMEOUT_MS = 30000;

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
  devops:    ['devops', 'dev ops', 'devsecops'],
  sre:       ['sre', 'site reliability'],
  platform:  ['platform engineer', 'platform sre', 'platform infra', 'platform team'],
  infra:     ['infrastructure', 'infra engineer'],
  cloud:     ['cloud engineer', 'cloud architect', 'cloud platform', 'cloud infra'],
  data:      ['data engineer', 'data platform', 'analytics engineer'],
  backend:   ['backend', 'back-end'],
  frontend:  ['frontend', 'front-end'],
  fullstack: ['fullstack', 'full-stack', 'full stack'],
  ml:        ['machine learning', 'ml engineer', 'ai engineer', 'mlops'],
  security:  ['security engineer', 'appsec', 'devsecops', 'cloud security'],
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

async function scanLever(archetype, companies) {
  const results = await Promise.all(companies.map(async co => {
    try {
      const jobs = await fetchWithTimeout(`https://api.lever.co/v0/postings/${co.slug}?mode=json`);
      if (!Array.isArray(jobs)) return [];
      return jobs
        .filter(j => jobMatchesArchetype(j.text, j.categories?.team, archetype))
        .map(j => ({
          title: j.text,
          company: co.name,
          location: j.categories?.location || co.location,
          url: j.hostedUrl,
          applyUrl: j.applyUrl,
          description: cleanHtml(j.description).slice(0, 400),
          source: 'lever',
          id: j.id,
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
        .map(j => ({
          title: j.title,
          company: co.name,
          location: j.location?.name || co.location,
          url: j.absolute_url,
          applyUrl: j.absolute_url,
          description: `${j.title} at ${co.name} in ${j.location?.name || co.location}`,
          source: 'greenhouse',
          id: String(j.id),
        }));
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

    const all = [...leverJobs, ...ghJobs];
    process.stdout.write(`  Found ${all.length} matching jobs.\n`);
    log.op('scan_done', { archetype, total: all.length, lever: leverJobs.length, greenhouse: ghJobs.length });
    return all;
  }

  getCompanies(filter = null) {
    if (!filter) return this.companies;
    return this.companies.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  }
}

export default PortalScanner;
