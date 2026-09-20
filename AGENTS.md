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

- `run` — the autonomous loop: scan -> prefilter -> evaluate -> morning digest,
  all through a durable task queue (`--once`, `--dry-run`, `--max-tasks <n>`,
  `--archetype <name>`, `--interval <minutes>`; loops on the interval without
  `--once`)
- `hunt` — thin alias: `run --once` for a single archetype (fixed B-19 — this
  used to call a no-op evaluate step and print a dead file path)
- `scan` — LIVE scan of company ATS boards; populates the DB
- `list` (aliases `jobs`, `browse`) — INSTANT offline browse of already-scanned jobs (no network)
- `apply <url>` — AI auto-fill apply flow (opens a browser; you review & submit)
- `evaluate <url>` — grounded job scoring: the LLM only extracts facts; a
  deterministic, versioned formula scores them (`--fresh` bypasses reuse)
- `eval-models` — cross-provider extraction agreement report (real LLM calls)
- `label <jobId> good|bad|clear` / `calibrate [--accept]` — your labels and
  interview/offer/rejection outcomes feed a bounded score-weight proposal;
  nothing changes until `--accept` creates the next `score_versions` row
- `inbox [--since 14d] [--dry-run]` — read-only Gmail IMAP; matches replies to
  applications and queues outcomes for your review
- `prep <description|file>` — interview-prep guide + YouTube resources;
  `prep <jobId>` / `prep --plan` — gap-derived topic checklist; `quiz` — drill
- `resume <job-id>` — tailored ATS resume PDF (+ `tailor-report.md`: every
  reworded bullet is checked against its source, ungrounded ones revert)
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
  `applications`, `documents`, plus the v5 funnel tables `pipeline`,
  `pipeline_events`, `tasks`, `llm_calls`, `score_versions`, and the inbox
  tables (`src/core/db.js`, singleton + migrations). Every pipeline state
  change goes through `transition()` in `src/core/pipeline/states.js`.
  The company registry is the `companies` **table**; `config/company-portals.json`
  only seeds it (via `npm run seed:ats` / `scripts/seed-ats-companies.js`).
- **Core** (`src/core/`) — pure services, no console/inquirer I/O: `aiClient`,
  `jobEvaluator`, `resumeGenerator`, `interviewPrep`, `profileManager`,
  `autoFill/*`, `scoring/` (extract → validate → score → narrative, plus
  `calibrate.js`), `pipeline/` (state machine, queue, budget, prefilter, digest),
  `inbox/` (Gmail outcome capture), and the **scanner v2** in `src/core/scan/`
  (per-ATS providers: Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee,
  Workable, Workday, Oracle HCM, SuccessFactors, Amazon, JSON-LD fallback, a
  web-search LinkedIn provider, and the Remotive/Himalayas aggregators;
  `index.js` orchestrator does hash-dedup + soft-close of stale postings).
- **Provider failover:** `aiClient` fails over across providers with timed
  cooldowns; when every provider is cooling down it throws instead of sleeping
  past 60 s (5 min total per process) so the queue retries the task later (B-29).
- **Auto-fill answers:** notice period, CTC, country and work authorization are
  filled only from `applicationAnswers:` in `config/profile.yml` (never guessed);
  unknown required questions are listed for you (B-30).
- **CLI** (`src/cli/`) — interactive shell + one file per flow (`listJobs.js`,
  `applyJob.js`, `scanPortals.js`, `evaluateJob.js`, …).
- **Web** (`src/web/`) — zero-dependency stdlib `http` server + single-file
  dashboard, backed directly by the same SQLite DB.

Scanner reach: **40+ live-verified companies across
Greenhouse/Lever/Ashby/SmartRecruiters (200+ in the registry)**. No TTL cache —
"new since last scan" is a real DB query, not a heuristic.

## 🛠️ Harness & Operational Tooling

- **PowerShell Service Manager:** `.\hunt-job.ps1` (commands: `start`, `stop`, `restart`, `status`, `scan`, `list`, `test`, `e2e`, `dashboard`, `watch`)
- **Browser E2E Testing:** `node huntjob_e2e_test_standalone.mjs` or `npm run test:e2e` (see [BROWSER_HARNESS.md](BROWSER_HARNESS.md))
- **Product & Design Specs:** [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md)
- **Agent Skills:** Local-only design/UX skills under `.agents/skills/` (`ui-ux-pro-max`, `emil-design-eng`, `impeccable`, `vibe-ui-ux`), pinned in `skills-lock.json`. Both are gitignored — not part of the product; install locally if needed.
- **Change & Milestone Roadmap:** `change_bug_tracker/ROADMAP.json`

## More

Full feature reference and API examples live in **[CLAUDE.md](CLAUDE.md)**.
User-facing docs: README.md, QUICKSTART.md, SETUP_GUIDE.md, FAQ.md.
