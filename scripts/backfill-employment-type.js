#!/usr/bin/env node
/**
 * backfill-employment-type.js — populate jobs.employment_type for rows stored
 * before the v4 migration.
 *
 * Those rows were scanned before providers extracted the field, and a re-scan
 * won't help for any posting whose content hasn't changed. But their `title`
 * and `description` are already in the DB, so the same heuristic the scanner
 * uses can be applied offline — no network.
 *
 * Structured provider data always wins on the next real scan (the upsert sets
 * employment_type unconditionally), so this is a floor, not a ceiling.
 *
 * Usage: npm run backfill:commitment [-- --dry-run]
 */
import { getDb, closeDb } from '../src/core/db.js';
import { guessEmploymentType } from '../src/core/scan/normalize.js';

const dryRun = process.argv.includes('--dry-run');
// --reset re-derives EVERY row instead of only the null ones. Needed after the
// heuristic changes, since a value written by an earlier, looser run is no
// longer null and would otherwise be skipped forever.
const reset = process.argv.includes('--reset');
const db = getDb();

const rows = db.prepare(
  `SELECT id, title, description FROM jobs ${reset ? '' : 'WHERE employment_type IS NULL'}`
).all();

if (reset && !dryRun) db.prepare(`UPDATE jobs SET employment_type = NULL`).run();

console.log(`${rows.length} job(s) with no employment_type.`);

const update = db.prepare(`UPDATE jobs SET employment_type = ? WHERE id = ?`);
const counts = {};
let matched = 0;

const run = db.transaction(() => {
  for (const r of rows) {
    const type = guessEmploymentType(r.title, r.description);
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
    matched++;
    if (!dryRun) update.run(type, r.id);
  }
});
run();

console.log(
  `${dryRun ? 'Would set' : 'Set'} ${matched} (${((matched / (rows.length || 1)) * 100).toFixed(1)}%): ` +
  (Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none')
);
console.log(`${rows.length - matched} left null — no signal in title or description; a live scan may fill them.`);
closeDb();
