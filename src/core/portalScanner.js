/**
 * portalScanner.js — thin back-compat wrapper around scan/index.js (Scanner
 * v2, plan §2). Keeps the same class shape, return array shape, and named
 * exports the rest of the codebase (interactive.js, migrate-to-sqlite.js)
 * already depends on.
 */
import 'dotenv/config';
import { createLogger } from './logger.js';
import { getDb } from './db.js';
import { scanAll } from './scan/index.js';
import {
  isIndiaLocation,
  cleanHtml,
  jobMatchesArchetype,
  daysAgoLabel,
} from './scan/normalize.js';

const log = createLogger('portalScanner');

const MAX_JOB_AGE_DAYS = 90; // Greenhouse/Lever boards often leave ancient reqs open — drop stale ones

// Fallback seed used only if the `companies` table has no ATS-known rows yet
// (fresh install before the first `npm run audit-portals` / migration).
const LEVER_COMPANIES = [
  { name: 'Paytm',    slug: 'paytm',   location: 'Noida / Bangalore' },
  { name: 'Meesho',   slug: 'meesho',  location: 'Bangalore' },
  { name: 'CRED',     slug: 'cred',    location: 'Bangalore' },
  { name: 'Fi Money', slug: 'epifi',   location: 'Bangalore' },
  { name: 'Highspot', slug: 'highspot',location: 'Hyderabad' },
];

const GREENHOUSE_COMPANIES = [
  { name: 'PhonePe',     slug: 'phonepe',     location: 'Bangalore' },
  { name: 'InMobi',      slug: 'inmobi',      location: 'Bangalore' },
  { name: 'Thoughtworks', slug: 'thoughtworks',location: 'Bangalore / Pune' },
  { name: 'Stripe',      slug: 'stripe',      location: 'Bengaluru' },
  { name: 'Cloudflare',  slug: 'cloudflare',  location: 'Bangalore' },
  { name: 'Okta',        slug: 'okta',        location: 'Bangalore / Hyderabad' },
  { name: 'Figma',       slug: 'figma',       location: 'Bangalore' },
  { name: 'Coursera',    slug: 'coursera',    location: 'Bangalore / Gurugram' },
  { name: 'Reddit',      slug: 'reddit',      location: 'Bangalore' },
  { name: 'Amplitude',   slug: 'amplitude',   location: 'Bangalore' },
  { name: 'PagerDuty',   slug: 'pagerduty',   location: 'Bangalore' },
  { name: 'New Relic',   slug: 'newrelic',    location: 'Bangalore' },
  { name: 'MongoDB',     slug: 'mongodb',     location: 'Gurgaon / Bangalore' },
  { name: 'Elastic',     slug: 'elastic',     location: 'Bangalore' },
  { name: 'Databricks',  slug: 'databricks',  location: 'Bengaluru' },
  { name: 'Airbnb',      slug: 'airbnb',      location: 'Gurgaon' },
  { name: 'Asana',       slug: 'asana',       location: 'Bangalore' },
  { name: 'Brex',        slug: 'brex',        location: 'Bangalore' },
  { name: 'Lattice',     slug: 'lattice',     location: 'Bangalore' },
  { name: 'Intercom',    slug: 'intercom',    location: 'Bangalore / Hyderabad' },
  { name: 'Rubrik',      slug: 'rubrik',      location: 'Bangalore / Pune' },
  { name: 'GitLab',      slug: 'gitlab',      location: 'Remote-India' },
  { name: 'Scale AI',    slug: 'scaleai',     location: 'Bangalore' },
  { name: 'Anthropic',   slug: 'anthropic',   location: 'Bangalore' },
  { name: 'HubSpot',     slug: 'hubspot',     location: 'Bangalore' },
];

const HARDCODED_FALLBACK = [
  ...LEVER_COMPANIES.map(c => ({ ...c, api: 'lever' })),
  ...GREENHOUSE_COMPANIES.map(c => ({ ...c, api: 'greenhouse' })),
];

function companiesFromDb() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT name, slug, ats_platform, location FROM companies
      WHERE ats_platform IS NOT NULL AND ats_platform != '' AND slug IS NOT NULL AND slug != ''
    `).all();
    return rows.map(r => ({ name: r.name, slug: r.slug, location: r.location, api: r.ats_platform }));
  } catch {
    return [];
  }
}

// All companies reachable via a scan provider — DB-backed, falls back to the
// hardcoded seed list if the companies table has no ATS-known rows yet.
const dbCompanies = companiesFromDb();
export const SCANNABLE_COMPANIES = dbCompanies.length ? dbCompanies : HARDCODED_FALLBACK;

class PortalScanner {
  constructor() {
    // config/company-portals.json seeded the companies table in Phase 1;
    // getCompanies() below now reads from there.
  }

  /**
   * Runs Scanner v2 (src/core/scan/index.js) and returns the SAME array
   * shape earlier hunt-job versions returned: title/company/location/url/
   * applyUrl/description/source/id/postedAt/postedLabel.
   */
  async scan(archetype, specificCompanies = null) {
    let companies = null;
    if (specificCompanies?.length) {
      const filter = specificCompanies.map(s => s.toLowerCase());
      companies = SCANNABLE_COMPANIES.filter(c =>
        filter.some(f => c.name.toLowerCase().includes(f) || c.slug.includes(f))
      ).map(c => ({ name: c.name, slug: c.slug, location: c.location, ats_platform: c.api }));
      if (!companies.length) companies = null; // nothing matched — scan everything
    }

    process.stdout.write(`  Scanning ${companies?.length ?? SCANNABLE_COMPANIES.length} company job boards...\n`);

    const { jobs, errors } = await scanAll(archetype, companies ? { companies } : {});

    const all = jobs
      .filter(j => Number.isFinite(j.postedAt) && (Date.now() - j.postedAt) < MAX_JOB_AGE_DAYS * 86400000)
      .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0))
      .map(j => ({
        title: j.title,
        company: j.company,
        location: j.location,
        url: j.url,
        applyUrl: j.applyUrl,
        description: (j.description || '').slice(0, 400),
        source: j.source,
        id: j.id.split(':').slice(2).join(':') || j.id, // externalId portion, matches legacy `id` values
        postedAt: j.postedAt,
        postedLabel: daysAgoLabel(j.postedAt),
      }));

    const newCount = all.filter(j => j.postedAt && (Date.now() - j.postedAt) < 172800000).length; // < 48h
    process.stdout.write(`  Found ${all.length} matching jobs${newCount ? ` (${newCount} posted in last 48h 🔥)` : ''}.\n`);
    if (errors.length) {
      process.stdout.write(`  ${errors.length} company scan(s) failed (see logs).\n`);
    }
    log.op('scan_done', { archetype, total: all.length, new48h: newCount, errors: errors.length });
    return all;
  }

  getCompanies(filter = null) {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT * FROM companies').all();
      if (!filter) return rows;
      return rows.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    } catch {
      return [];
    }
  }
}

export default PortalScanner;

export {
  isIndiaLocation,
  cleanHtml,
  jobMatchesArchetype,
  daysAgoLabel,
};
