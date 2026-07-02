import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/hunt-job.db');

// Schema-version-based migrations (PRAGMA user_version). Append new steps,
// never edit old ones — each index in this array runs exactly once per DB.
const MIGRATIONS = [
  // v1 — initial schema: companies, jobs, evaluations, applications, documents (plan §2.5 + §3)
  db => {
    db.exec(`
      CREATE TABLE companies (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        slug          TEXT,               -- ATS board token (lever/greenhouse)
        ats_platform  TEXT,               -- 'lever' | 'greenhouse' | NULL
        location      TEXT,
        career_url    TEXT,
        enabled       INTEGER NOT NULL DEFAULT 1,
        last_ok_at    INTEGER,
        fail_count    INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
      );
      CREATE UNIQUE INDEX idx_companies_name ON companies(name COLLATE NOCASE);

      CREATE TABLE jobs (
        id            TEXT PRIMARY KEY,   -- '{platform}:{company}:{external_id}'
        company_id    TEXT NOT NULL,
        ats_platform  TEXT NOT NULL,
        title         TEXT NOT NULL,
        location      TEXT,
        url           TEXT,
        apply_url     TEXT,
        description   TEXT,
        content_hash  TEXT,               -- change detection
        status        TEXT DEFAULT 'active',  -- active | closed
        posted_at     INTEGER,            -- unix ms
        first_seen_at INTEGER,
        last_seen_at  INTEGER
      );
      CREATE INDEX idx_jobs_company ON jobs(company_id);
      CREATE INDEX idx_jobs_status ON jobs(status);

      CREATE TABLE evaluations (
        id           TEXT PRIMARY KEY,
        url          TEXT,
        evaluation   TEXT NOT NULL,       -- JSON blob (dimensions/matches/reasoning/etc.)
        profile      TEXT,                -- JSON blob (archetypes/salaryRange snapshot)
        evaluated_at TEXT NOT NULL
      );
      CREATE INDEX idx_evaluations_evaluated_at ON evaluations(evaluated_at DESC);

      CREATE TABLE applications (
        id                  TEXT PRIMARY KEY,
        title               TEXT,
        company             TEXT,
        location            TEXT,
        url                 TEXT,
        status              TEXT,
        applied_at          TEXT,
        applicant_name      TEXT,
        apply_method        TEXT,
        platform            TEXT,
        fields_filled_count INTEGER,
        resume_uploaded     INTEGER,
        resume_path         TEXT,
        evaluation_score    REAL,
        recommendation      TEXT
      );
      CREATE INDEX idx_applications_url ON applications(url);

      CREATE TABLE documents (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id     TEXT,                  -- loosely references evaluations.id / jobs.id
        type       TEXT NOT NULL,         -- 'resume' | 'interview_prep' | ...
        file_path  TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer) * 1000)
      );
      CREATE INDEX idx_documents_job_id ON documents(job_id);
    `);
  },
  // v2 — http_cache: ETag / If-Modified-Since cache for scan/httpClient.js (plan §2.4)
  db => {
    db.exec(`
      CREATE TABLE http_cache (
        url           TEXT PRIMARY KEY,
        etag          TEXT,
        last_modified TEXT,
        status        INTEGER,
        body          TEXT,
        cached_at     INTEGER NOT NULL
      );
    `);
  },
  // v3 — applications.updated_at, so the web dashboard's PATCH can record edit time (plan §5.2)
  db => {
    db.exec(`ALTER TABLE applications ADD COLUMN updated_at TEXT;`);
  },
];

let _db = null;

/** Applies any migrations not yet run, tracked via PRAGMA user_version. Exported for tests. */
export function runMigrations(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

/** Singleton connection to data/hunt-job.db (WAL mode, migrated). */
export function getDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  runMigrations(_db);
  process.on('exit', closeDb);
  return _db;
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

export { DB_PATH };
