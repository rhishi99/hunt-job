# Fable question swarm — shared brief (hunt-job, 17 Sep 2026)

Repo root: `E:\vibe-code-projects\hunt-job`. Every relative path below is relative to it.

## The goal
Hunt-Job is a single owner's (Rhishi's) AI-powered job-search agent & tactical morning triage command center for tech roles in India (Bengaluru, Hyderabad, Pune, NCR, Chennai, Mumbai) and Global Remote:
- Live ATS board scan (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable + Schema.org JSON-LD fallback + Remotive/Himalayas aggregators)
- Local SQLite database (`data/hunt-job.db`) with content-hash deduplication, incremental sync, and soft-closing of stale postings
- 10-dimension candidate alignment scoring (Salary in LPA/INR, Tech stack, Culture, Growth, Location/Remote, Team, Product, WLB, Progression, Dealbreakers) via multi-provider AI (`src/core/aiClient.js`: Claude, Gemini, Groq, OpenRouter, NVIDIA)
- Tailored ATS-optimized resume PDF synthesis (EJS + headless Chromium via Puppeteer) and 4-week structured interview prep guides with curated YouTube resources
- Human-in-the-loop auto-fill apply engine (Playwright/Puppeteer browser automation filling candidate fields with strict manual submission)
- Watch daemon (`hunt-job.js watch`, `hunt-job.ps1`, Task Scheduler) + zero-dependency stdlib HTTP web dashboard (`src/web/`) with live Kanban pipeline.

**Owner's goal for this round:**
Maximum tactical triage autonomy (review daily new roles in < 10 mins), zero false-positive / ghost jobs, unflinching signal accuracy in 10-dim fit scoring, 100% reliable auto-fill with zero accidental submits, a closed feedback loop from application outcomes back into scoring weights, and an architecture clean enough to execute Phase 5 (multi-profile switching, Indian salary analytics, daily email digest) or open-source/productize it.

You are hunting for questions **beyond your own ability to answer confidently**. Survivors go to frontier models (Claude 3.7 Sonnet / Opus / Fable 5.1), whose time and tokens are expensive. A question a grep, a doc read, or a junior engineer could settle is a FAILURE. Good question = crosses modules or needs a design trade-off, grounded in a real race / unenforced invariant / feedback loop that cannot close / cost or token spend that scales badly / gate that measures the wrong thing / scoring dimension whose accuracy is never calibrated against real hiring outcomes.

## Hard rules
- **READ-ONLY.** Create, edit or delete NOTHING in the repo (the ONLY file you write is your own report, if your instructions say to write one). Never run anything that applies to jobs, triggers form submissions, calls external ATS apply endpoints, sends notifications, spends paid LLM/API quota, touches production databases, or spawns long-running dev servers. Allowed: reading files, grep/search, `git log`, `git show`.
- **NEVER** trigger form submission or click "Submit" / "Apply Now" buttons in browser automation code paths other than by reading.
- Excluded always: paid APIs or paid models, buying hardware, new third-party accounts "for growth", generic advice (add tests / rewrite in TypeScript / switch SQLite to PostgreSQL / add Redis / add Docker) unless tied to a specific evidenced failure in this code.

## Read the known-issues sources FIRST (items there are EXCLUDED unless you bring new evidence)
- `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`, `AGENTS.md`, `BROWSER_HARNESS.md`, `SETUP_GUIDE.md`
- `change_bug_tracker/ROADMAP.json` (open items in Phase 5: multi-profile switching, Indian compensation insights, email digest)
- Already known & decided (do not re-raise without new evidence):
  - SQLite (`data/hunt-job.db`, WAL mode, 4 migrations) is the local-first single-user source of truth; external relational DBs (Postgres/Supabase) were rejected as over-engineering for a local CLI/desktop tool.
  - The web dashboard (`src/web/server.js` + `src/web/dashboard.html`) is intentionally a zero-dependency single HTML file served by Node stdlib `http`; migrating to React/Vite was deferred unless DOM complexity breaks triage.
  - Public ATS JSON APIs are strictly preferred over HTML scraping; HTML/DOM scraping is only used via JSON-LD fallback for custom company portals.
  - Soft-closing: when an ATS stops listing a job, the scanner marks it `status = 'closed'` rather than deleting it; companies self-disable after 5 consecutive fetch failures.
  - Human-in-the-loop is a hard invariant: the auto-fill engine navigates and fills forms, but the user MUST review and click submit.
  - Single active profile in `config/profile.json` is intentional for v1.0.0; multi-profile switching is planned for Phase 5.

## Method
- **Every claim cites `path:line` that you actually opened.** No citation, no question.
- **PASS 1:** deep-read your slice. Write 8–12 questions ranked by impact on the owner's goal. Freeze the list.
- **PASS 2:** try to answer each one from code + notes + git history. A guess is not an answer.

## Exact output format per question
```
### Q<n>. <one-line question>
- Category: speed | quality | autonomy | reliability | architecture | security
- Modules / evidence: <path:line, path:line — what each line shows>
- Why it is hard: <the trade-off or the cross-module reason a grep cannot settle it>
- Impact if solved: <in terms of tactical triage autonomy / scoring precision / application safety / offer conversion>
- Pass-2 status: ANSWERED | PARTIAL | UNANSWERED
- Pass-2 answer: <what the code actually shows>
- Still missing: <what would be needed to finish it>
```
End the report with one line exactly: `answered N / partial N / unanswered N`.

Start the report with a 3-line header: slice name, files actually read (count), and any file in your slice list that did not exist.
