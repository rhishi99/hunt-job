# Hunt-Job × Hermes — Usage Guide (End-User Notes)

> **Role of this doc:** You (Hermes) are an *end user* of the hunt-job app, not its
> maintainer. This file records how to drive hunt-job from inside a Hermes session —
> the exact commands, the correct data shapes, and the known runtime quirks found while
> using it. **No code changes here — only operating notes.**

---

## 1. What hunt-job is (one paragraph)

An AI job-search agent with four pillars: **scan** (direct ATS JSON APIs → a local SQLite
DB), **evaluate** (10-dimension LLM scoring), **prepare** (tailored resume PDF + interview
prep), and **apply** (human-in-the-loop browser autofill). It is *India-focused* by default
and *local-first*: profile, jobs, evaluations and resumes never leave the machine except
the JD/profile text sent to the chosen LLM provider.

---

## 2. Command cheat-sheet (verified against package.json + hunt-job.js)

All commands run from the repo root (`E:\vibe-code-projects\hunt-job`).

```bash
# Interactive menu (recommended for humans; NOT ideal from Hermes — see §5)
npm start

# Scan ATS portals live (populates data/hunt-job.db → jobs table)
node hunt-job.js scan --archetype "DevOps Engineer" --limit 10

# INSTANT offline browse of already-scanned jobs (no network) — prefer this for reads
node hunt-job.js list --archetype "DevOps Engineer" --new --json

# Watch: recurring scan + desktop toast on new matches (Ctrl+C to stop)
node hunt-job.js watch --archetype "DevOps Engineer" --interval 30 --once

# Evaluate one posting — full 10-dimension report
node hunt-job.js evaluate "https://boards.greenhouse.io/acme/jobs/123"

# Tailored resume (needs a prior evaluation id)
node hunt-job.js resume <job-id>
# (or) npm run generate-resume -- <job-id>

# Interview prep from a JD string or a text file
node hunt-job.js prep "Senior Backend Engineer at Flipkart"

# AI auto-fill apply — opens a REAL browser; you review & submit, it never submits
node hunt-job.js apply "https://boards.greenhouse.io/acme/jobs/123"

# Local web dashboard (kanban pipeline) → http://127.0.0.1:7777
npm run dashboard

# Maintain the company registry (re-verify ATS platform/slug)
node hunt-job.js audit-portals
node hunt-job.js detect https://careers.company.com
npm run seed:ats
```

**Shared filter flags** for `scan` and `list`: `-a/--archetype`, `-s/--since <days>`,
`--new`, `--new-hours <h>`, `-n/--limit <n>`, `-c/--company`, `-l/--location`, `--remote`,
`--all`/`--all-locations`, `-p/--platform`, `--json`.

---

## 3. How to run it *from Hermes* (the important part)

Hermes' `terminal` tool is a **git-bash/MSYS shell**, not PowerShell/cmd. Two consequences:

1. **Path style:** use `/e/vibe-code-projects/hunt-job` (MSYS) or
   `E:/vibe-code-projects/hunt-job` (forward-slash native). `cd /e/...` works; native
   `node` then needs `E:/...`-style paths if you pass absolute file paths as args.
2. **Native `node` / CLI programs get no MSYS path translation** — pass `E:/...` paths.

**Do NOT drive the interactive menu (`npm start`) from Hermes.** It uses `inquirer`
prompts that need a real TTY and will hang under Hermes' non-TTY capture. Use direct
subcommands (`list`, `scan`, `evaluate`) with `--json` instead.

**Recommended read path (offline, deterministic):** `node hunt-job.js list ... --json`,
then parse stdout. This never opens a browser, never prompts, and never mutates state.

**Watch mode from Hermes:** use `node hunt-job.js scan --archetype "..."` on demand rather
than the long-running `watch` (which blocks and fires desktop toasts that Hermes can't
see). If a periodic job is wanted, schedule `scan --once` (or `watch --once`) through
Hermes' own cron, not an internal `watch` loop.

---

## 4. Provider / API-key setup (matches the user's environment)

hunt-job auto-selects whichever AI key is present. In `.env` (gitignored — *never* logged),
the configured keys are: **GEMINI, GROQ, NVIDIA (NIM), OPENROUTER**; `ANTHROPIC` is commented
out; `AI_PROVIDER` overrides auto-selection.

> **Hermes note:** the user runs Hermes on the **NVIDIA NIM** provider
> (`https://integrate.api.nvidia.com/v1`). hunt-job's `src/core/aiClient.js` supports
> NVIDIA as a first-class provider, so the same `NVIDIA_API_KEY` can drive both. Keep that
> key out of any doc/log — it is already in `.env` (redacted in all my reads).

---

## 5. Known runtime quirks / bugs (observed, not yet fixed)

1. **Doc/schema drift — README & CLAUDE.md column names are wrong for `jobs`.**
   Docs say "company" and "score" columns; the real `jobs` table uses `company_id`,
   `title`, `location`, `url`, `apply_url`, `status`, `posted_at`. The `evaluations` table
   stores `url` + `evaluation` (JSON blob) — not columns. Cost ~2 min to discover from
   bare SQL. **Recommendation:** read jobs via `list --json` / `query.js`, never hand-roll
   SQL against `jobs`.
2. **India filter is failing in practice.** 12,950 jobs in DB, but the newest rows are
   Timișoara (Romania), Reutlingen (Germany), Joinville/Brazil, Suzhou (China) — i.e.
   `scanAll` is ingesting non-India postings despite the claimed location enforcement.
   Needs a fresh scan to confirm whether the filter runs at scan-time or only at `list`.
3. **Profile is effectively empty.** `config/profile.yml` has blank email/phone/role,
   `archetypes: []`, `techStack: []`. Evaluation/resume quality depends on this being
   filled. Fix: `npm run profile:init` (interactive — run in a real terminal, not Hermes)
   or set `HUNT_JOB_*` env vars (see README §Environment Variables) for zero-prompt setup.
4. **Playwright browser IS installed** (chromium ~1228, headless_shell, firefox, webkit) so
   resume PDF + auto-fill should work — but `apply` opens a *visible* browser, which is
   right for the human-in-the-loop flow but means Hermes must hand off to the user for the
   actual submit step.
5. **Node 24 vs better-sqlite3:** repo tested on Node 16+; this machine has Node v24.11.1.
   The native `better-sqlite3` binding opened fine in readonly mode above, so it's been
   rebuilt — but watch for native-module rebuild errors after any `npm install`.

---

## 6. Sensitive-files checklist (reviewed — nothing exposed)

- `.env` — **present, gitignored, contains live API keys.** Verified redacted; never cat it.
- `config/profile.yml` — personal data, gitignored. Currently blank.
- `data/hunt-job.db` — jobs/evaluations/applications, gitignored, 175 MB.
- `.gitignore` correctly excludes `.env*`, `config/profile.yml`, `modes/*.md`, `data/`,
  `temp/`, `.agents/`, `skills-lock.json`, `claude-yolo.ps1`.