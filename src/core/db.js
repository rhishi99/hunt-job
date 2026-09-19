import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalUrl } from './pipeline/identity.js';

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
  // v4 — part-time / contract sourcing.
  //   employment_type: normalized commitment ('full-time'|'part-time'|'contract'|
  //     'internship'|'temporary'|null) — most ATS APIs expose this, we just never stored it.
  //   employer: the hiring company for AGGREGATOR sources (Remotive, Himalayas), where
  //     company_id is the source, not the employer. NULL for per-company ATS boards,
  //     which resolve the name via the companies table join.
  db => {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN employment_type TEXT;
      ALTER TABLE jobs ADD COLUMN employer TEXT;
      CREATE INDEX idx_jobs_employment_type ON jobs(employment_type);
    `);
  },
  // v5 — pipeline state machine + job identity + task queue + LLM budget
  // ledger + versioned scoring + inbox capture (T7 §5.3) + prep loop (T5
  // §7.2). See docs/fable51-answers.md §0.1, §2.3, §5.3, §7.2.
  db => {
    db.exec(`
      -- identity + prefilter on the existing jobs table (§2.2, §1.3, §4)
      ALTER TABLE jobs ADD COLUMN canonical_url    TEXT;
      ALTER TABLE jobs ADD COLUMN prefilter_score  REAL;
      ALTER TABLE jobs ADD COLUMN prefilter_reason TEXT;
      ALTER TABLE jobs ADD COLUMN description_state TEXT NOT NULL DEFAULT 'full';
      CREATE INDEX idx_jobs_canonical_url ON jobs(canonical_url);

      -- one row per job that entered the funnel (§2.3)
      CREATE TABLE pipeline (
        job_id            TEXT PRIMARY KEY REFERENCES jobs(id),
        state             TEXT NOT NULL,
        state_changed_at  INTEGER NOT NULL,
        score             REAL,
        score_version     INTEGER,
        evaluation_id     TEXT,
        resume_document_id INTEGER,
        prep_document_id  INTEGER,
        application_id    TEXT,
        user_label        TEXT,
        repost_of         TEXT,
        interview_at      INTEGER,
        notes             TEXT
      );
      CREATE INDEX idx_pipeline_state ON pipeline(state);

      CREATE TABLE pipeline_events (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id    TEXT NOT NULL,
        from_state TEXT, to_state TEXT NOT NULL,
        actor     TEXT NOT NULL,
        reason    TEXT,
        at        INTEGER NOT NULL
      );
      CREATE INDEX idx_pipeline_events_job ON pipeline_events(job_id, at);

      -- durable work queue (§1.4)
      CREATE TABLE tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT NOT NULL,
        job_id      TEXT,
        key         TEXT NOT NULL UNIQUE,
        state       TEXT NOT NULL DEFAULT 'queued',
        priority    INTEGER NOT NULL DEFAULT 0,
        attempts    INTEGER NOT NULL DEFAULT 0,
        not_before  INTEGER NOT NULL DEFAULT 0,
        last_error  TEXT,
        payload     TEXT,
        created_at  INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER
      );
      CREATE INDEX idx_tasks_runnable ON tasks(state, not_before, priority DESC);

      -- LLM call ledger = the budget (§1.5)
      CREATE TABLE llm_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT, task_kind TEXT NOT NULL,
        ok INTEGER NOT NULL, error_class TEXT,
        tokens_in INTEGER, tokens_out INTEGER, ms INTEGER
      );
      CREATE INDEX idx_llm_calls_day ON llm_calls(at, provider);

      -- evaluations get real columns (JSON blob stays for the narrative) (§2.4, §3)
      ALTER TABLE evaluations ADD COLUMN job_id        TEXT;
      ALTER TABLE evaluations ADD COLUMN content_hash  TEXT;
      ALTER TABLE evaluations ADD COLUMN profile_hash  TEXT;
      ALTER TABLE evaluations ADD COLUMN model         TEXT;
      ALTER TABLE evaluations ADD COLUMN extraction    TEXT;
      ALTER TABLE evaluations ADD COLUMN score         REAL;
      ALTER TABLE evaluations ADD COLUMN score_version INTEGER;
      ALTER TABLE evaluations ADD COLUMN recommendation TEXT;
      CREATE UNIQUE INDEX idx_evaluations_key ON evaluations(job_id, content_hash, profile_hash, score_version);

      ALTER TABLE applications ADD COLUMN job_id TEXT;
      ALTER TABLE applications ADD COLUMN evaluation_id TEXT;
      ALTER TABLE applications ADD COLUMN resume_document_id INTEGER;
      ALTER TABLE applications ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
      CREATE UNIQUE INDEX idx_applications_job_attempt ON applications(job_id, attempt);

      ALTER TABLE documents ADD COLUMN content_hash TEXT;
      ALTER TABLE documents ADD COLUMN verification TEXT;
      ALTER TABLE companies ADD COLUMN scan_config TEXT;

      CREATE TABLE score_versions (version INTEGER PRIMARY KEY, weights TEXT NOT NULL, created_at INTEGER NOT NULL, reason TEXT);

      -- inbox capture (§5.3, T7)
      CREATE TABLE inbox_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE, received_at INTEGER, from_domain TEXT, subject TEXT,
        outcome TEXT, confidence REAL, matched_job_id TEXT, matched_by TEXT,
        needs_review INTEGER NOT NULL DEFAULT 0, snippet TEXT,
        applied INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL
      );

      -- prep / training loop (§7.2, T5)
      CREATE TABLE prep_topics (
        topic_key TEXT PRIMARY KEY,
        label TEXT NOT NULL, category TEXT,
        weight REAL NOT NULL DEFAULT 0,
        source_job_ids TEXT NOT NULL,
        source TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE prep_progress (
        topic_key TEXT PRIMARY KEY REFERENCES prep_topics(topic_key),
        status TEXT NOT NULL DEFAULT 'todo',
        self_rating INTEGER, last_practiced_at INTEGER, notes TEXT
      );
      CREATE TABLE prep_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, topic_key TEXT NOT NULL, job_id TEXT,
        kind TEXT NOT NULL,
        score REAL, at INTEGER NOT NULL
      );
    `);

    // Backfill jobs.canonical_url for every existing row, from url then apply_url (§2.2).
    const jobs = db.prepare('SELECT id, url, apply_url FROM jobs WHERE canonical_url IS NULL').all();
    const setCanonical = db.prepare('UPDATE jobs SET canonical_url = ? WHERE id = ?');
    for (const j of jobs) {
      const cu = canonicalUrl(j.url) || canonicalUrl(j.apply_url);
      if (cu) setCanonical.run(cu, j.id);
    }

    // score_versions v1 = the weight table in §3.3.
    db.prepare(`INSERT INTO score_versions (version, weights, created_at, reason) VALUES (1, ?, ?, ?)`).run(
      JSON.stringify({
        skill_fit: 0.4,
        seniority_fit: 0.15,
        location_fit: 0.2,
        salary_fit: 0.1,
        role_scope: 0.1,
        freshness: 0.05,
      }),
      Date.now(),
      'initial weights, docs/fable51-answers.md §3.3'
    );
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

export { DB_PATH, MIGRATIONS };
