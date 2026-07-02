import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH  = path.join(__dirname, '../../data/job-cache.db');
const TTL_DAYS    = 7;    // max age before rows are pruned from DB
const TTL_HOURS   = 4;    // scans older than this are considered "stale" in the menu
const MAX_ROWS    = 6;    // keep 2× display limit so pruning is gradual

const DDL = `
  CREATE TABLE IF NOT EXISTS scan_cache (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    archetype      TEXT    NOT NULL,
    company_filter TEXT,
    job_count      INTEGER NOT NULL,
    jobs           TEXT    NOT NULL,
    scanned_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_scan_archetype_time
    ON scan_cache (archetype, scanned_at DESC);
`;

let _db = null;

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(DDL);
  process.on('exit', closeDb);
  return _db;
}

export function getRecentScans(archetype, limit = 3) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, archetype, company_filter, job_count, jobs, scanned_at
    FROM   scan_cache
    WHERE  archetype  = ?
      AND  scanned_at >= datetime('now', '-${TTL_DAYS} days')
    ORDER  BY scanned_at DESC
    LIMIT  ?
  `).all(archetype.toLowerCase(), limit);

  return rows.map(row => ({
    id:            row.id,
    archetype:     row.archetype,
    companyFilter: row.company_filter,
    jobCount:      row.job_count,
    scannedAt:     row.scanned_at,
    jobs:          JSON.parse(row.jobs),
    ageMs:         Date.now() - new Date(row.scanned_at).getTime(),
  }));
}

/** Returns true if the most recent scan for this archetype is within TTL_HOURS */
export function hasFreshScan(archetype) {
  const scans = getRecentScans(archetype, 1);
  if (!scans.length) return false;
  return scans[0].ageMs < TTL_HOURS * 3_600_000;
}

export { TTL_HOURS };

export function saveScans(archetype, jobs, companyFilter = null) {
  if (!jobs?.length) return;
  const db   = getDb();
  const key  = archetype.toLowerCase();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO scan_cache (archetype, company_filter, job_count, jobs)
      VALUES (?, ?, ?, ?)
    `).run(key, companyFilter ?? null, jobs.length, JSON.stringify(jobs));

    // prune: keep only the MAX_ROWS newest per archetype
    db.prepare(`
      DELETE FROM scan_cache
      WHERE  archetype = ?
        AND  id NOT IN (
          SELECT id FROM scan_cache
          WHERE  archetype = ?
          ORDER  BY scanned_at DESC
          LIMIT  ?
        )
    `).run(key, key, MAX_ROWS);
  })();
}

export function clearCache(archetype) {
  const db = getDb();
  db.prepare(`DELETE FROM scan_cache WHERE archetype = ?`).run(archetype.toLowerCase());
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}
