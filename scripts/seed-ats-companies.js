#!/usr/bin/env node
/**
 * seed-ats-companies.js — add India-hiring companies on the newer ATS providers
 * (Ashby, SmartRecruiters) to the `companies` registry. Every slug here was
 * verified live (returns jobs + has India/remote postings) before inclusion.
 *
 * Idempotent: upserts by company name, then confirms each board with a live
 * fetch and sets health (last_ok_at / fail_count). Re-run any time.
 *
 * Usage:  node scripts/seed-ats-companies.js
 *
 * Note: Recruitee + Workable providers are wired but not seeded — probing found
 * no India employers on them (both are EU-SMB heavy). Add via `hunt-job detect
 * <careers-url>` + audit-portals if you find one.
 */
import chalk from 'chalk';
import { getDb, closeDb } from '../src/core/db.js';
import { PROVIDERS } from '../src/core/scan/index.js';
import { isIndiaLocation } from '../src/core/scan/normalize.js';

// name, slug (ATS board token), ats_platform, location label
const SEED = [
  // ── SmartRecruiters (company id) ──
  ['Bosch',           'BoschGroup',     'smartrecruiters', 'Bengaluru / Coimbatore / Hyderabad'],
  ['Continental',     'Continental',    'smartrecruiters', 'Bengaluru'],
  ['Experian',        'Experian',       'smartrecruiters', 'Hyderabad / Mumbai'],
  ['Western Digital', 'WesternDigital', 'smartrecruiters', 'Bengaluru'],
  ['Visa',            'Visa',           'smartrecruiters', 'Bengaluru'],
  // ── Ashby (job-board handle) ──
  ['Sarvam AI',       'sarvam',         'ashby',           'Bengaluru'],
  ['Atlan',           'atlan',          'ashby',           'Remote / India'],
  ['SpotDraft',       'spotdraft',      'ashby',           'Bengaluru'],
  ['OpenAI',          'openai',         'ashby',           'Bengaluru / Remote'],
  ['Notion',          'notion',         'ashby',           'Remote'],
  ['PostHog',         'posthog',        'ashby',           'Remote'],
  ['Ramp',            'ramp',           'ashby',           'Remote'],
];

const upsert = db => db.prepare(`
  INSERT INTO companies (name, slug, ats_platform, location, enabled)
  VALUES (@name, @slug, @platform, @location, 1)
  ON CONFLICT(name) DO UPDATE SET slug = @slug, ats_platform = @platform, location = @location, enabled = 1
`);

async function main() {
  const db = getDb();
  const put = upsert(db);
  console.log(chalk.cyan.bold(`\nSeeding ${SEED.length} Ashby/SmartRecruiters companies...\n`));

  let ok = 0, totalIndia = 0;
  for (const [name, slug, platform, location] of SEED) {
    put.run({ name, slug, platform, location });
    const row = db.prepare('SELECT id FROM companies WHERE name = ?').get(name);
    try {
      const jobs = await PROVIDERS[platform].fetchJobs({ id: row.id, name, slug, location });
      const india = jobs.filter(j => isIndiaLocation(j.location)).length;
      db.prepare('UPDATE companies SET last_ok_at = ?, fail_count = 0 WHERE id = ?').run(Date.now(), row.id);
      ok++; totalIndia += india;
      console.log(`  ${chalk.green('OK  ')} ${name.padEnd(18)} ${(platform + '/' + slug).padEnd(30)} ${jobs.length} jobs · ${india} India/remote`);
    } catch (e) {
      db.prepare('UPDATE companies SET fail_count = fail_count + 1 WHERE id = ?').run(row.id);
      console.log(`  ${chalk.red('FAIL')} ${name.padEnd(18)} ${(platform + '/' + slug).padEnd(30)} ${e.message}`);
    }
  }

  console.log(chalk.bold(`\n${ok}/${SEED.length} verified · ~${totalIndia} India/remote postings now scannable.`));
  console.log(chalk.gray('Next:  node hunt-job.js scan --archetype "<role>"   then   node hunt-job.js list\n'));
  closeDb();
}

main().catch(e => { console.error(chalk.red('Seed error:'), e.message); process.exit(1); });
