#!/usr/bin/env node
/**
 * auditPortals.js — re-verify every company row in the `companies` table
 * (plan §2.3/§8 Phase 2). For companies with a known ats_platform+slug, hits
 * the provider endpoint directly. For unknown ones, runs detect.js against
 * career_url. Updates ats_platform/slug/enabled/last_ok_at/fail_count and
 * prints a summary table.
 *
 * Usage: npm run audit-portals
 */
import chalk from 'chalk';
import { getDb, closeDb } from '../core/db.js';
import { PROVIDERS } from '../core/scan/index.js';
import { detect } from '../core/scan/detect.js';

const CONCURRENCY = 5;
const FAIL_THRESHOLD = 5;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function auditCompany(db, company) {
  let platform = company.ats_platform;
  let slug = company.slug;

  if (!platform || !slug) {
    if (!company.career_url) return { name: company.name, ok: false, platform, slug, message: 'no career_url on file' };
    const detection = await detect(company.career_url).catch(() => null);
    if (!detection?.platform) return { name: company.name, ok: false, platform, slug, message: 'ATS undetected' };
    platform = detection.platform;
    slug = detection.token || slug;
  }

  const provider = PROVIDERS[platform];
  if (!provider || !slug) {
    return { name: company.name, ok: false, platform, slug, message: `detected ${platform || 'unknown'} — no scan provider yet` };
  }

  try {
    const jobs = await provider.fetchJobs({ ...company, slug });
    db.prepare(`UPDATE companies SET ats_platform = ?, slug = ?, enabled = 1, last_ok_at = ?, fail_count = 0 WHERE id = ?`)
      .run(platform, slug, Date.now(), company.id);
    return { name: company.name, ok: true, platform, slug, message: `${jobs.length} jobs` };
  } catch (err) {
    const failCount = (company.fail_count || 0) + 1;
    db.prepare(`
      UPDATE companies SET ats_platform = ?, slug = ?, fail_count = ?,
        enabled = CASE WHEN ? >= ? THEN 0 ELSE enabled END
      WHERE id = ?
    `).run(platform, slug, failCount, failCount, FAIL_THRESHOLD, company.id);
    return { name: company.name, ok: false, platform, slug, message: err.message };
  }
}

async function main() {
  const db = getDb();
  const companies = db.prepare('SELECT * FROM companies ORDER BY name').all();
  console.log(chalk.cyan.bold(`\nAuditing ${companies.length} companies...\n`));

  const results = await mapLimit(companies, CONCURRENCY, c => auditCompany(db, c));

  for (const r of results) {
    const icon = r.ok ? chalk.green('OK  ') : chalk.red('FAIL');
    const platformStr = r.platform ? `${r.platform}${r.slug ? '/' + r.slug : ''}` : '-';
    console.log(`  ${icon}  ${r.name.padEnd(28)} ${platformStr.padEnd(28)} ${r.message}`);
  }

  const okCount = results.filter(r => r.ok).length;
  console.log(chalk.bold(`\n${okCount}/${results.length} companies healthy.\n`));
  closeDb();
}

main().catch(err => { console.error(chalk.red('Error:'), err.message); process.exit(1); });
