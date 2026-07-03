# Hunt-Job — Agent & Contributor Notes

**Version:** 1.0.0 · **Based on:** Career-Ops (extended fork) · **License:** MIT

## What this is

Hunt-Job is an AI-powered job-search agent for the India market. It scans
company ATS boards, scores postings across 10 dimensions, generates
ATS-optimized resumes, builds interview-prep plans, and can auto-fill
application forms — all driven from a terminal UI or direct CLI. The AI layer
is multi-provider (Claude by default; Gemini / Groq / OpenRouter / NVIDIA also
supported via `src/core/aiClient.js`). Everything runs and stores locally.

## Commands

Run via `node hunt-job.js <command>` (or the matching `npm run` script):

- `hunt` — one-shot full workflow (scan + evaluate top matches)
- `scan` — LIVE scan of company ATS boards; populates the DB
- `list` (aliases `jobs`, `browse`) — INSTANT offline browse of already-scanned jobs (no network)
- `apply <url>` — AI auto-fill apply flow (opens a browser; you review & submit)
- `evaluate <url>` — 10-dimension job scoring
- `prep <description|file>` — interview-prep guide + YouTube resources
- `resume <job-id>` — tailored ATS resume PDF
- `watch` — periodic scan + desktop notification on new matches
- `dashboard` — local web dashboard at http://127.0.0.1:7777
- `detect <careers-url>` — detect a company's ATS platform
- `audit-portals` — re-verify/re-detect the whole company registry
- `profile init|edit`, `setup`, `parse-resume <path>`, `start`/`interactive`

`scan` and `list` share filter flags: `-a/--archetype`, `-s/--since <days>`,
`--new`, `--new-hours <h>`, `-n/--limit <n>`, `-c/--company <t>`,
`-l/--location <t>`, `--remote`, `--all/--all-locations`, `-p/--platform <ats>`,
`--json`.

## Architecture

- **Runtime:** Node.js (ESM). Entry point `hunt-job.js` is a thin arg-parser → dispatch.
- **Storage:** SQLite at `data/hunt-job.db` — `companies`, `jobs`, `evaluations`,
  `applications`, `documents` tables (`src/core/db.js`, singleton + migrations).
  The company registry is the `companies` **table**; `config/company-portals.json`
  only seeds it (via `npm run seed:ats` / `scripts/seed-ats-companies.js`).
- **Core** (`src/core/`) — pure services, no console/inquirer I/O: `aiClient`,
  `jobEvaluator`, `resumeGenerator`, `interviewPrep`, `profileManager`,
  `autoFill/*`, and the **scanner v2** in `src/core/scan/` (per-ATS providers:
  Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable + JSON-LD
  fallback; `index.js` orchestrator does hash-dedup + soft-close of stale postings).
- **CLI** (`src/cli/`) — interactive shell + one file per flow (`listJobs.js`,
  `applyJob.js`, `scanPortals.js`, `evaluateJob.js`, …).
- **Web** (`src/web/`) — zero-dependency stdlib `http` server + single-file
  dashboard, backed directly by the same SQLite DB.

Scanner reach: **40+ live-verified companies across
Greenhouse/Lever/Ashby/SmartRecruiters (200+ in the registry)**. No TTL cache —
"new since last scan" is a real DB query, not a heuristic.

## More

Full feature reference and API examples live in **[CLAUDE.md](CLAUDE.md)**.
User-facing docs: README.md, QUICKSTART.md, SETUP_GUIDE.md, FAQ.md.
