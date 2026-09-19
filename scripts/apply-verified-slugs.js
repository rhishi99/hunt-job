#!/usr/bin/env node
/**
 * apply-verified-slugs.js — Brief 7 (docs/fable51-answers.md §4, "registry
 * activation rung 1"). Applies the name-verified slug table from §4.4 to the
 * `companies` table:
 *
 *  - DIRECT_ENTRIES: companies with a live board on a provider this repo
 *    already scans (greenhouse/lever/ashby/smartrecruiters) — set
 *    slug + ats_platform and ENABLE.
 *  - WORKDAY_ENTRIES / ORACLEHCM_ENTRIES / SUCCESSFACTORS_ENTRIES: companies
 *    on a platform with no provider code yet (brief 8) — store the tenant/
 *    host/site info in `scan_config` (migration v5) but leave DISABLED so
 *    `scanAll` never tries a platform with no `PROVIDERS[...]` entry.
 *
 * A row already on a working direct provider is never downgraded to a
 * disabled scan_config-only platform (see the Visa case: doc lists a
 * visa.wd5/Visa Workday tenant, but Visa already has a healthy SmartRecruiters
 * board in this registry — that wins, the Workday entry is skipped).
 *
 * Two greenhouse rows (New Relic, Razorpay) carry the doc's "verify" caveat
 * (§4.4) instead of a plain verified mark, because their slug came from a
 * fuzzy/landing-marker guess rather than a clean name match (§4.1's `tcs`/
 * `linkedin`/`bcg` false positives are the reason such a check exists at
 * all). For those two only, this script makes one live GET to the
 * Greenhouse board-meta endpoint and requires the returned `name` to token-
 * match the company before applying — everything else in the doc is applied
 * on the strength of the 2026-09-19 sweep's own verification.
 *
 * Entries the doc explicitly declines to resolve (Uber US-only; Workday
 * hosts with no confirmed site; Oracle HCM/SuccessFactors companies with no
 * confirmed host) are never written — see EXPLICIT_SKIPS, printed for
 * visibility only.
 *
 * Usage:
 *   node scripts/apply-verified-slugs.js --dry-run   # print the plan, write nothing
 *   node scripts/apply-verified-slugs.js             # apply it
 */
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from '../src/core/db.js';
import { fetchJson } from '../src/core/scan/httpClient.js';

export const DIRECT_PROVIDER_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'workable'];

// §4.4 "greenhouse" row. `verify: true` marks the two the doc itself flags as
// not plainly verified (New Relic "verify name"; Razorpay "from landing
// marker, verify").
export const DIRECT_ENTRIES = [
  { name: 'Anthropic', slug: 'anthropic', platform: 'greenhouse' },
  { name: 'GitLab', slug: 'gitlab', platform: 'greenhouse' },
  { name: 'Stripe', slug: 'stripe', platform: 'greenhouse' },
  { name: 'Databricks', slug: 'databricks', platform: 'greenhouse' },
  { name: 'Thoughtworks', slug: 'thoughtworks', platform: 'greenhouse' },
  { name: 'Twilio', slug: 'twilio', platform: 'greenhouse' },
  { name: 'Airbnb', slug: 'airbnb', platform: 'greenhouse' },
  { name: 'Elastic', slug: 'elastic', platform: 'greenhouse' },
  { name: 'MongoDB', slug: 'mongodb', platform: 'greenhouse' },
  { name: 'Groww', slug: 'groww', platform: 'greenhouse' },
  { name: 'Datadog', slug: 'datadog', platform: 'greenhouse' },
  { name: 'Cloudflare', slug: 'cloudflare', platform: 'greenhouse' },
  { name: 'Okta', slug: 'okta', platform: 'greenhouse' },
  { name: 'Figma', slug: 'figma', platform: 'greenhouse' },
  { name: 'Coursera', slug: 'coursera', platform: 'greenhouse' },
  { name: 'Zscaler', slug: 'zscaler', platform: 'greenhouse' },
  { name: 'Reddit', slug: 'reddit', platform: 'greenhouse' },
  { name: 'PagerDuty', slug: 'pagerduty', platform: 'greenhouse' },
  { name: 'Amplitude', slug: 'amplitude', platform: 'greenhouse' },
  { name: 'New Relic', slug: 'newrelic', platform: 'greenhouse', verify: true },
  { name: 'Razorpay', slug: 'razorpaysoftwareprivatelimited', platform: 'greenhouse', verify: true },
  // §4.4 "lever" row
  { name: 'Spotify', slug: 'spotify', platform: 'lever' },
  { name: 'Pocket FM', slug: 'pocketfm', platform: 'lever' },
  // §4.4 "ashby" row
  { name: 'Snowflake', slug: 'snowflake', platform: 'ashby' },
  { name: 'Confluent', slug: 'confluent', platform: 'ashby' },
  { name: 'Notion', slug: 'notion', platform: 'ashby' },
  // §4.4 "smartrecruiters" row (uber excluded — doc: "1, US only — skip")
  { name: 'Swiggy', slug: 'swiggy', platform: 'smartrecruiters' },
  { name: 'Freshworks', slug: 'freshworks', platform: 'smartrecruiters' },
  { name: 'ServiceNow', slug: 'servicenow', platform: 'smartrecruiters' },
  { name: 'Canva', slug: 'canva', platform: 'smartrecruiters' },
  { name: 'Grab', slug: 'grab', platform: 'smartrecruiters' },
  { name: 'Wise', slug: 'wise', platform: 'smartrecruiters' },
  { name: 'ixigo', slug: 'ixigo', platform: 'smartrecruiters' },
  { name: 'Unacademy', slug: 'unacademy', platform: 'smartrecruiters' },
  { name: 'Whatfix', slug: 'whatfix', platform: 'smartrecruiters' },
  { name: 'Cars24', slug: 'cars24', platform: 'smartrecruiters' },
  { name: 'NoBroker', slug: 'nobroker', platform: 'smartrecruiters' },
];

// §4.4 "workday" row — verified by robots.txt and/or a CXS `total` (§4.2
// rung 3). No workday.js provider exists yet (brief 8), so these are stored
// disabled; `scan_config` is what brief 8's provider will read.
export const WORKDAY_ENTRIES = [
  { name: 'Accenture', tenant: 'accenture', wd: 'wd103', site: 'AccentureCareers' },
  { name: 'Intel', tenant: 'intel', wd: 'wd1', site: 'External' },
  { name: 'Autodesk', tenant: 'autodesk', wd: 'wd1', site: 'Ext' },
  { name: 'BrowserStack', tenant: 'browserstack', wd: 'wd3', site: 'External' },
  { name: 'Mastercard', tenant: 'mastercard', wd: 'wd1', site: 'CorporateCareers' },
  // Doc also lists visa.wd5/Visa; Visa already has a healthy SmartRecruiters
  // board in DIRECT_ENTRIES, so planEntry() skips this one (see module doc).
  { name: 'Visa', tenant: 'visa', wd: 'wd5', site: 'Visa' },
  { name: 'Zendesk', tenant: 'zendesk', wd: 'wd1', site: 'zendesk' },
  { name: 'DXC Technology', tenant: 'dxctechnology', wd: 'wd1', site: 'DXCJobs' },
  { name: 'Red Hat', tenant: 'redhat', wd: 'wd5', site: 'jobs' },
  { name: 'Workday', tenant: 'workday', wd: 'wd5', site: 'Workday' },
  { name: 'Adobe', tenant: 'adobe', wd: 'wd5', site: 'external_experienced' },
  { name: 'Zoom', tenant: 'zoom', wd: 'wd5', site: 'Zoom' },
  { name: 'CrowdStrike', tenant: 'crowdstrike', wd: 'wd5', site: 'crowdstrikecareers' },
  { name: 'Salesforce', tenant: 'salesforce', wd: 'wd12', site: 'External_Career_Site' },
  { name: 'PwC', tenant: 'pwc', wd: 'wd3', site: 'Global_Experienced_Careers' },
  { name: 'Micron', tenant: 'micron', wd: 'wd1', site: 'External' },
  { name: 'NVIDIA', tenant: 'nvidia', wd: 'wd5', site: 'NVIDIAExternalCareerSite' },
  { name: 'Morgan Stanley', tenant: 'ms', wd: 'wd5', site: 'External' },
  { name: 'Deutsche Bank', tenant: 'db', wd: 'wd3', site: 'DBWebsite' },
  { name: 'Barclays', tenant: 'barclays', wd: 'wd3', site: 'External_Career_Site_Barclays' },
  { name: 'BlackRock', tenant: 'blackrock', wd: 'wd1', site: 'BlackRock_Professional' },
  { name: 'GE Vernova', tenant: 'gevernova', wd: 'wd5', site: 'Vernova_ExternalSite' },
  { name: 'HP', tenant: 'hp', wd: 'wd5', site: 'ExternalCareerSite' },
  { name: 'Marvell', tenant: 'marvell', wd: 'wd1', site: 'MarvellCareers' },
  { name: 'Infosys', tenant: 'infosys', wd: 'wd103', site: 'BLS_Careers' },
  { name: 'VMware', tenant: 'broadcom', wd: 'wd1', site: 'External_Career' },
  { name: 'Qualcomm', tenant: 'qualcomm', wd: 'wd12', site: 'External' },
  {
    name: 'Sprinklr', tenant: 'sprinklr', wd: 'wd1', site: 'intern_newgrad',
    note: 'campus site only — assumption #8: a second, experienced-role site exists and is not yet found',
  },
  {
    name: 'Fidelity', tenant: 'fmr', wd: 'wd1', site: 'FidelityCareers',
    hostForm: 'myworkdaysite', path: '/recruiting/fmr/FidelityCareers',
    note: 'host is wd1.myworkdaysite.com, not the usual myworkdayjobs.com form; CXS path for this form is an assumption (§8.4)',
  },
];

// §4.4 "oraclehcm" row — only JPMorgan has a fully confirmed host+site
// (§4.3: "jpmc.fa.oraclecloud.com, CX_1001"); the other six only have a
// region code ("sites to confirm" per the doc), which is not enough to
// build a working request, so they are left out (see EXPLICIT_SKIPS).
export const ORACLEHCM_ENTRIES = [
  { name: 'JPMorgan', host: 'jpmc.fa.oraclecloud.com', site: 'CX_1001' },
];

// §4.4 "successfactors" row — only SAP and Wipro have a confirmed host in
// the doc (§4.3); Ericsson/NetApp/EY are named with no host given.
export const SUCCESSFACTORS_ENTRIES = [
  { name: 'SAP', host: 'jobs.sap.com' },
  { name: 'Wipro', host: 'careers.wipro.com' },
];

// Informational only — never written. Printed so the report accounts for
// every name the doc mentions, not just the ones applied.
export const EXPLICIT_SKIPS = [
  { name: 'Uber', platform: 'smartrecruiters', reason: '1 job, US only — doc says skip' },
  { name: 'Palo Alto Networks', platform: 'workday', reason: 'host found, site unknown — rung 3 guesses (§4.4)' },
  { name: 'Citi', platform: 'workday', reason: 'host found, site unknown — rung 3 guesses (§4.4)' },
  { name: 'Oracle', platform: 'oraclehcm', reason: 'region only (us2), site unconfirmed' },
  { name: 'Texas Instruments', platform: 'oraclehcm', reason: 'region only (us2), site unconfirmed' },
  { name: 'KPMG', platform: 'oraclehcm', reason: 'region only (em2), site unconfirmed' },
  { name: 'Zensar', platform: 'oraclehcm', reason: 'no host/region given' },
  { name: 'Hexaware', platform: 'oraclehcm', reason: 'no host/region given' },
  { name: 'Honeywell', platform: 'oraclehcm', reason: 'region only (ocs), site unconfirmed' },
  { name: 'Ericsson', platform: 'successfactors', reason: 'no host given' },
  { name: 'NetApp', platform: 'successfactors', reason: 'no host given' },
  { name: 'EY', platform: 'successfactors', reason: 'no host given' },
];

const STOPWORDS = new Set([
  'india', 'pvt', 'ltd', 'private', 'limited', 'inc', 'llc', 'corp', 'corporation', 'group', 'software', 'the', 'co',
]);

function tokens(s) {
  return new Set(
    (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).filter(t => !STOPWORDS.has(t))
  );
}

/** Normalized-token containment or Jaccard >= 0.5 (§4.2 rung-1 acceptance rule). */
export function nameMatches(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  const containment = [...ta].some(t => t.length > 2 && [...tb].some(u => u.includes(t) || t.includes(u)));
  return inter / union >= 0.5 || containment;
}

/** Live check for the two flagged greenhouse rows — no fixture needed elsewhere (injectable for tests). */
export async function verifyGreenhouseBoard(slug, expectedName, fetchJsonFn = fetchJson) {
  const data = await fetchJsonFn(`https://boards-api.greenhouse.io/v1/boards/${slug}`);
  return { ok: !!data?.name && nameMatches(data.name, expectedName), boardName: data?.name };
}

function findByName(db, name) {
  return db.prepare('SELECT * FROM companies WHERE name = ? COLLATE NOCASE').get(name);
}

/**
 * Decides what to do with one entry against the current DB state. Never
 * touches the DB — pure planning, so it's unit-testable against a fixture.
 */
export async function planEntry(db, entry, { verify = verifyGreenhouseBoard } = {}) {
  const existing = findByName(db, entry.name);
  const isDirect = DIRECT_PROVIDER_PLATFORMS.includes(entry.platform);

  if (!isDirect && existing && DIRECT_PROVIDER_PLATFORMS.includes(existing.ats_platform) && existing.enabled) {
    return { ...entry, action: 'skip', reason: `already on ${existing.ats_platform} (direct provider) — not overwriting with ${entry.platform} config` };
  }

  if (entry.verify) {
    try {
      const { ok, boardName } = await verify(entry.slug, entry.name);
      if (!ok) return { ...entry, action: 'skip', reason: `name check failed (board says "${boardName ?? 'unknown'}")` };
    } catch (err) {
      return { ...entry, action: 'skip', reason: `verify request failed: ${err.message}` };
    }
  }

  const slug = isDirect ? entry.slug : null;
  const enabled = isDirect ? 1 : 0;
  const scanConfig = entry.scan_config ? JSON.stringify(entry.scan_config) : null;

  if (
    existing &&
    existing.ats_platform === entry.platform &&
    (existing.slug || null) === (slug || null) &&
    Number(existing.enabled) === enabled &&
    (existing.scan_config || null) === scanConfig
  ) {
    return { ...entry, action: 'noop', reason: 'already applied', slug, enabled, scan_config: scanConfig };
  }

  return { ...entry, action: existing ? 'update' : 'insert', slug, enabled, scan_config: scanConfig };
}

function withWorkdayConfig(e) {
  const { name, tenant, wd, site, hostForm, path, note } = e;
  return { name, platform: 'workday', scan_config: { tenant, wd, site, hostForm, path, note } };
}
function withOracleConfig(e) {
  const { name, host, site } = e;
  return { name, platform: 'oraclehcm', scan_config: { host, site } };
}
function withSuccessFactorsConfig(e) {
  const { name, host } = e;
  return { name, platform: 'successfactors', scan_config: { host } };
}

export function allEntries() {
  return [
    ...DIRECT_ENTRIES,
    ...WORKDAY_ENTRIES.map(withWorkdayConfig),
    ...ORACLEHCM_ENTRIES.map(withOracleConfig),
    ...SUCCESSFACTORS_ENTRIES.map(withSuccessFactorsConfig),
  ];
}

export async function buildPlan(db, opts = {}) {
  const plan = [];
  for (const entry of allEntries()) plan.push(await planEntry(db, entry, opts));
  return plan;
}

const upsert = db => db.prepare(`
  INSERT INTO companies (name, slug, ats_platform, enabled, scan_config)
  VALUES (@name, @slug, @platform, @enabled, @scan_config)
  ON CONFLICT(name) DO UPDATE SET slug = @slug, ats_platform = @platform, enabled = @enabled, scan_config = @scan_config
`);

export function applyPlan(db, plan) {
  const put = upsert(db);
  const txn = db.transaction(items => {
    for (const p of items) {
      if (p.action === 'insert' || p.action === 'update') {
        put.run({ name: p.name, slug: p.slug ?? null, platform: p.platform, enabled: p.enabled, scan_config: p.scan_config ?? null });
      }
    }
  });
  txn(plan);
}

function printPlan(plan) {
  for (const p of plan) {
    const icon = { insert: chalk.green('NEW '), update: chalk.yellow('UPD '), skip: chalk.gray('SKIP'), noop: chalk.gray('OK  ') }[p.action];
    console.log(`  ${icon} ${p.name.padEnd(22)} ${p.platform.padEnd(15)} ${p.reason || ''}`);
  }
  for (const s of EXPLICIT_SKIPS) {
    console.log(`  ${chalk.gray('SKIP')} ${s.name.padEnd(22)} ${s.platform.padEnd(15)} doc-excluded — ${s.reason}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = getDb();
  const beforeEnabled = db.prepare('SELECT COUNT(*) c FROM companies WHERE enabled = 1').get().c;

  console.log(chalk.cyan.bold(`\n${dryRun ? '[dry-run] ' : ''}Applying §4.4 verified slug table...\n`));
  const plan = await buildPlan(db);
  printPlan(plan);

  if (!dryRun) applyPlan(db, plan);

  const afterEnabled = dryRun ? beforeEnabled : db.prepare('SELECT COUNT(*) c FROM companies WHERE enabled = 1').get().c;
  const counts = plan.reduce((acc, p) => ((acc[p.action] = (acc[p.action] || 0) + 1), acc), {});
  console.log(chalk.bold(
    `\ninsert=${counts.insert || 0} update=${counts.update || 0} skip=${counts.skip || 0} noop=${counts.noop || 0} ` +
    `(+${EXPLICIT_SKIPS.length} doc-excluded)`
  ));
  console.log(chalk.bold(`enabled companies: ${beforeEnabled} -> ${dryRun ? `${afterEnabled} (dry-run, unchanged)` : afterEnabled}\n`));
  closeDb();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error(chalk.red('apply-verified-slugs error:'), err.message); process.exit(1); });
}
