#!/usr/bin/env node
/**
 * seed-aggregators.js — register the aggregator job sources in the companies table.
 *
 * These aren't companies, they're feeds carrying many employers. The registry
 * is still the right home: scanAll() iterates it, and `enabled`/`last_ok_at`/
 * `fail_count` give aggregators the same health tracking and rate-limit clock
 * as an ATS board (see scan/index.js MIN_INTERVAL_MS handling).
 *
 * Usage: npm run seed:aggregators
 */
import { getDb, closeDb } from '../src/core/db.js';

const SOURCES = [
  {
    name: 'Remotive',
    slug: 'devops-sysadmin',
    ats_platform: 'remotive',
    location: 'Worldwide Remote',
    career_url: 'https://remotive.com/remote-jobs/devops-sysadmin',
  },
  {
    name: 'Himalayas',
    slug: 'himalayas',
    ats_platform: 'himalayas',
    location: 'Worldwide Remote',
    career_url: 'https://himalayas.app/jobs',
  },
  {
    name: 'LinkedIn Search',
    slug: 'linkedin-search',
    ats_platform: 'linkedin-search',
    location: 'India + Remote',
    career_url: 'https://www.linkedin.com/jobs/',
  },
];

const db = getDb();

// idx_companies_name is UNIQUE on name COLLATE NOCASE — upsert on it so a
// re-run refreshes the platform/slug without duplicating or resetting health.
const upsert = db.prepare(`
  INSERT INTO companies (name, slug, ats_platform, location, career_url, enabled)
  VALUES (@name, @slug, @ats_platform, @location, @career_url, 1)
  ON CONFLICT(name) DO UPDATE SET
    slug         = excluded.slug,
    ats_platform = excluded.ats_platform,
    location     = excluded.location,
    career_url   = excluded.career_url,
    enabled      = 1,
    fail_count   = 0
`);

db.transaction(() => SOURCES.forEach(s => upsert.run(s)))();

for (const s of SOURCES) {
  const row = db.prepare('SELECT id, name, ats_platform, enabled FROM companies WHERE name = ?').get(s.name);
  console.log(`  ${row.id}\t${row.name}\t${row.ats_platform}\tenabled=${row.enabled}`);
}
console.log(`\n${SOURCES.length} aggregator source(s) registered.`);
closeDb();
