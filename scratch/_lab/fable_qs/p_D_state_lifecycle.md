# Slice D — SQLite State, Tracking & Feedback Loops

Read `scratch/_lab/fable_qs/_brief.md` first and follow it exactly.
Print your full report to stdout (it is captured to a file). Do not write any file.

## Focus
Does ANY path close the feedback loop from real-world hiring outcomes back into scoring, and is local database state strictly consistent?
- **Absence of the Outcome Learning Loop:** When an application status transitions from `applied` → `interviewing` → `offered` (or `rejected`/`ghosted`) in the `applications` table, does ANY mechanism feed this signal back into company tiering, archetype matching, or 10-dimension rubric weights? Can the system discover which tech stacks or compensation ranges actually convert to interviews?
- **Loosely Coupled Keys Across Entities:** Why do `evaluations` and `applications` link to `jobs` primarily through `url` strings rather than foreign keys on `jobs.id`? What happens when ATS URLs normalize differently (trailing slashes, tracking tokens, UTM parameters, redirect URLs)? Are applications orphaned?
- **Concurrency & WAL Locking:** With `better-sqlite3` running in WAL mode, what happens when a scheduled background scan (`hunt-job.js watch` or `hunt-job.ps1`) writes new jobs while the web dashboard (`src/web/server.js`) executes a `PATCH /api/applications/:id` or an interactive CLI user initiates a resume generation? Are DB writes strictly serialized and crash-safe?
- **Migration Atomicity:** In `src/core/db.js:runMigrations()`, what happens if a migration step fails halfway through execution? Is the entire version increment rolled back, or does the DB get stuck in an unrecoverable corrupted schema state?
- **PII & Credential Isolation:** Where do candidate PII (phone number, current salary, compensation expectations) and AI API keys (`ANTHROPIC_API_KEY`, etc.) reside? Could any code path in `logger.js`, error handlers, or web server endpoints accidentally leak secrets into unencrypted disk logs or dashboard payloads?

## Files
- `src/core/db.js`, `src/core/profileManager.js`, `src/core/jobCache.js`, `src/core/logger.js`
- `scripts/migrate-to-sqlite.js`, `scripts/backfill-employment-type.js`, `scripts/seed-profile.js`
- `config/settings.json`
- `test/db.test.js`, `test/profileManager.test.js`, `test/migrate-to-sqlite.test.js`
