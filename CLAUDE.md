# Hunt-Job: AI Job Search Agent

**Version:** 1.0.0
**Based on:** Career-Ops (Extended and customized)

**Original Project:** Career-Ops by Contributors
**Current Fork:** Hunt-Job

## Overview

Career-Ops is a multi-agent job search system powered by Claude and built on Claude Code. It evaluates job listings, generates tailored ATS-optimized resumes, and manages your job search through an intelligent terminal interface.

## 🎯 Core Capabilities

### 1. **Job Evaluation Mode** (`/evaluate-job`)
Analyzes job postings across 10 dimensions:
- Salary alignment
- Tech stack compatibility
- Company culture fit
- Growth opportunities
- Remote/location requirements
- Team dynamics
- Product market fit
- Work-life balance indicators
- Career progression potential
- Dealbreaker compliance

**Usage:**
- `Evaluate this job posting: [URL]`
- `Score the Data Engineer role at [Company]`

### 2. **Portal Scanning Mode** (`/scan-portals`)
Scans companies via direct ATS JSON APIs — no HTML scraping for the platforms below:

- **Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable** — official public JSON APIs (`src/core/scan/providers/`)
- **JSON-LD fallback** (`providers/jsonld.js`) — for companies without a direct API integration: fetches the career page and reads the schema.org `JobPosting` markup most ATSes (even Workday/iCIMS) inject for Google Jobs SEO

The `companies` table in `data/hunt-job.db` (seeded from `config/company-portals.json`) is the registry — each row tracks `ats_platform`, `slug`, `last_ok_at`, `fail_count`, and self-disables after 5 consecutive failures. Re-verify/re-detect the whole registry with `hunt-job audit-portals`, or a single URL with `hunt-job detect <careers-url>`.

Every scan upserts into the `jobs` table (dedup + content-hash change detection) and soft-closes postings the ATS stops reporting — so "new since last scan" is a real query, not a heuristic. This powers `hunt-job watch` (§7 below).

**Usage:**
- `Scan for new roles matching my [Archetype]`
- `node hunt-job.js scan --archetype "Backend Engineer"`
- `node hunt-job.js detect https://careers.company.com`

**Filter flags** (shared by `scan` and `list`): `-a/--archetype <name>`, `-s/--since <days>`, `--new`, `--new-hours <h>`, `-n/--limit <n>`, `-c/--company <text>`, `-l/--location <text>`, `--remote`, `--all`/`--all-locations`, `-p/--platform <ats>`, `--json`.

### 2b. **Browse Saved Jobs** (`hunt-job list`, aliases `jobs` / `browse`)
INSTANT offline browse of the SQLite `jobs` table — no network. Same filter flags as `scan`. Use it to re-query what the last scan already saved.

**Usage:**
- `node hunt-job.js list --archetype "Backend Engineer" --new`
- `node hunt-job.js list -a "Data Engineer" --remote --json`

### 3. **Resume Generation Mode** (`/generate-resume`)
Creates ATS-optimized PDFs tailored to specific job listings.

**Features:**
- Extracts 15-20 most relevant keywords from JD
- Reorders experience bullets by relevance
- Generates clean, professional PDF
- Includes skill highlighting
- Maintains ATS compatibility

**Usage:**
- `Generate a resume for the Stripe job`
- `Create a tailored application package for [Job Title]`

### 3b. **Auto-Fill Apply Mode** (`hunt-job apply <url>`)
Opens a real Chromium browser, navigates to the application form, and auto-fills fields from your profile. Platform-specific adapters (Lever, Greenhouse, SmartRecruiters) plus a generic AI fallback. You review, answer custom questions, upload the resume, and submit — Hunt-Job never submits on your behalf. Result is tracked in the `applications` table.

**Usage:**
- `node hunt-job.js apply "https://boards.greenhouse.io/acme/jobs/123"`

### 4. **Profile Management** (`/profile`)
Manages your candidate profile stored locally.

**Configuration includes:**
- Base CV and proof points
- Role archetypes (e.g., Data Engineer, Product Manager)
- Salary expectations and dealbreakers
- Preferred tech stacks
- Remote/hybrid preferences

**Usage:**
- `Update my profile`
- `Add a new archetype`
- `Set my salary expectations`

### 5. **Interview Preparation Mode** (`/prepare-interview`)
Generates comprehensive interview preparation guides based on job descriptions.

**Features:**
- Bullet-point prep guide for specific role
- 10+ key focus areas tailored to job
- Tech stack concepts to master
- System design topics
- 10+ behavioral interview questions
- 4-week preparation schedule
- Common interview mistake warnings
- YouTube links for theory, tutorials, and practice problems
- Curated channels for each topic

**Usage:**
- `Prepare for this interview: [Job Description Text]`
- `Generate prep plan from job_description.txt`

### 6. **Web Dashboard** (`hunt-job dashboard`)
Local-only web dashboard — stdlib `http` server (no Express, no cloud) on `http://127.0.0.1:7777`, serving a single-file HTML UI + a JSON API backed directly by SQLite.

**Features:**
- Pipeline board (Scanned → Evaluated → Applied → Interview → Offer)
- Job list with score/freshness filters
- Evaluation report view, application timeline, profile summary

### 7. **Watch Mode** (`hunt-job watch`)
Runs `scanAll()` on a timer and surfaces new matches as they appear — a cron-style alternative to re-running `scan` by hand.

**Usage:**
- `node hunt-job.js watch --archetype "DevOps Engineer"` — scans every 30 minutes (default)
- `node hunt-job.js watch --archetype "DevOps Engineer" --interval 15` — custom interval, minimum 10 minutes
- `node hunt-job.js watch --archetype "DevOps Engineer" --once` — single cycle then exit (for cron/Task Scheduler)

Each cycle logs a summary line, prints a highlighted list of new matches, and fires a Windows toast notification (falls back to terminal bell + log on non-Windows, or if the toast fails). Stop with Ctrl+C.

## 📁 Directory Structure

```
hunt-job/
├── CLAUDE.md                          # This file
├── README.md                          # Command reference
├── package.json                       # Node dependencies, npm scripts
├── hunt-job.js                        # CLI entry point — thin arg-parser → dispatch
├── hunt-job.sh / hunt-job.bat          # Cross-platform launcher shims
├── runner.mjs                         # Legacy pure-function test runner (part of `npm test`)
├── src/
│   ├── index.js                       # Programmatic exports
│   ├── core/                          # Pure services — no console I/O, no inquirer
│   │   ├── db.js                      # SQLite singleton + migrations (data/hunt-job.db)
│   │   ├── aiClient.js                # Multi-provider AI client (Claude/Gemini/Groq/OpenRouter/NVIDIA)
│   │   ├── logger.js                  # JSONL logger (data/logs/<date>.jsonl)
│   │   ├── jobEvaluator.js            # 10-dimension scoring — fetches the JD before the LLM call
│   │   ├── resumeGenerator.js         # PDF generation (Playwright + EJS)
│   │   ├── resumeParser.js            # Parses an existing resume PDF into profile data
│   │   ├── interviewPrep.js           # Prep guide generation + YouTube resources
│   │   ├── profileManager.js          # Profile CRUD
│   │   ├── portalScanner.js           # v1 scanner — kept for its pure helpers (India/archetype filters)
│   │   ├── jobCache.js                # legacy scan-blob cache — superseded by scan/ + db.js `jobs` table
│   │   ├── autoFillBrowser.js         # Playwright browser driver for auto-fill
│   │   ├── autoFill/                  # ATS platform detection + form-fill adapters
│   │   │   ├── index.js
│   │   │   ├── platformDetector.js    # shared by scan/detect.js AND auto-fill
│   │   │   └── profileMapper.js
│   │   └── scan/                      # Scanner v2 provider architecture
│   │       ├── index.js               # orchestrator: scanAll() — fan-out, normalize, upsert, soft-close
│   │       ├── query.js               # offline query of the jobs table (powers `list`/browse + filters)
│   │       ├── detect.js              # ATS auto-detection (URL regex + DOM fingerprint fallback)
│   │       ├── httpClient.js          # fetch + timeout + retry + per-host rate limit + ETag cache
│   │       ├── normalize.js           # NormalizedJob shape + India-location/archetype-match filters
│   │       └── providers/             # one fetchJobs(companyRef) per ATS platform
│   │           ├── greenhouse.js, lever.js, ashby.js, smartrecruiters.js,
│   │           │   recruitee.js, workable.js
│   │           └── jsonld.js          # schema.org JobPosting fallback provider
│   ├── cli/
│   │   ├── interactive.js             # Interactive menu shell
│   │   ├── listJobs.js                # `hunt-job list` / `jobs` / `browse` — instant offline browse
│   │   ├── jobBrowse.js               # shared job-list rendering helper (used by list + flows)
│   │   ├── applyJob.js                # `hunt-job apply <url>` — AI auto-fill apply flow
│   │   ├── watch.js                   # `hunt-job watch`
│   │   ├── auditPortals.js            # `hunt-job audit-portals`
│   │   ├── hunt.js, evaluateJob.js, scanPortals.js, generateResume.js,
│   │   │   prepareInterview.js, parseResume.js, profileInit.js,
│   │   │   profileEdit.js, setupApiKey.js
│   │   ├── ui.js                      # Shared terminal widgets (banner, scoreBar, section, colors)
│   │   └── flows/                     # One file per interactive-menu flow
│   │       ├── scanFlow.js, browseFlow.js, evaluateFlow.js, resumeFlow.js,
│   │       │   prepFlow.js, applyFlow.js, huntFlow.js, setupFlow.js
│   └── web/
│       ├── server.js                  # `hunt-job dashboard` — stdlib http + /api/* JSON (SQLite-backed)
│       └── dashboard.html             # Single-file local dashboard UI
├── config/
│   ├── profile.yml                    # Your profile (generated)
│   ├── company-portals.json           # Seed data for the `companies` table (not read at runtime)
│   └── settings.json                  # Claude Code settings
├── modes/
│   └── _profile.md                    # Profile storage (generated)
├── data/
│   ├── hunt-job.db                    # SQLite — companies, jobs, evaluations, applications, documents
│   ├── logs/                          # JSONL logs, one file per day
│   ├── resumes/, interview-prep/      # Generated artifacts
│   └── <company>_<role>_<date>/       # Per-application generated docs (resume PDF + prep guide)
├── scripts/
│   ├── e2e-test.js                    # Smoke test
│   ├── seed-ats-companies.js          # Seed the companies table with live-verified ATS boards (npm run seed:ats)
│   └── migrate-to-sqlite.js           # One-time JSON → SQLite migration (already run; kept for reference)
└── test/                              # vitest unit tests, fixtures, and the runner.mjs pure-function suite
```

## 🚀 Getting Started

### Initial Setup
1. Ensure Node.js is installed: `node --version`
2. Install dependencies: `npm install`
3. Initialize your profile: `npm run profile:init`
4. Configure your API: `export ANTHROPIC_API_KEY=your_key`

### First Job Evaluation
```bash
node src/cli/evaluateJob.js "https://job-posting-url"
```

### Scanning Job Portals
```bash
node hunt-job.js scan --archetype "Data Engineer"
```

### Generate Tailored Resume
```bash
node src/cli/generateResume.js --job-id "job_123"
```

### Prepare for Interview
```bash
node src/cli/prepareInterview.js "Paste job description here" 
node src/cli/prepareInterview.js job_description.txt
```

### Browse Saved Jobs + Apply
```bash
node hunt-job.js list --archetype "Backend Engineer" --new   # instant, offline
node hunt-job.js apply "https://boards.greenhouse.io/acme/jobs/123"
```

### Watch for New Roles + Web Dashboard
```bash
node hunt-job.js watch --archetype "DevOps Engineer" --interval 30
node hunt-job.js detect https://careers.company.com
node hunt-job.js audit-portals
node hunt-job.js dashboard        # http://127.0.0.1:7777
```

## 🔑 Key Files

### Profile Configuration
- **Location:** `config/profile.yml` and `modes/_profile.md`
- **Contains:**
  - Work experience and accomplishments
  - Target archetypes
  - Salary requirements
  - Tech stack preferences
  - Dealbreakers

### Company Registry
- **Location:** `data/hunt-job.db` → `companies` table (seeded once from `config/company-portals.json`; the JSON file itself isn't read at runtime)
- **Contains:** company name, `ats_platform`, `slug`, `career_url`, `enabled`, `last_ok_at`, `fail_count`
- Re-verify the whole registry with `node hunt-job.js audit-portals`

### Job Evaluation Scoring
- **Algorithm:** 10-dimension scoring system
- **Minimum Apply Threshold:** 4.0/5.0
- **Dimensions:** Salary, tech stack, culture, growth, location, team, product, WLB, progression, dealbreakers

## ⚙️ Configuration

### Environment Variables
```bash
ANTHROPIC_API_KEY=your_api_key           # Required: Anthropic API key
CLAUDE_MODEL=claude-3-5-sonnet-20241022  # Optional: Model to use
SCANNING_MODEL=claude-3-5-haiku          # Optional: Faster model for scanning
```

### Settings (settings.json)
See `config/settings.json` for Claude Code customization:
- Model preferences
- API timeout settings
- Resume template preferences
- Dashboard refresh rate

## 🎓 Workflow

1. **Onboarding** → Run once to create your profile
2. **Scanning** → Get alerts when new matching jobs appear
3. **Evaluation** → Review scores and analytical reports
4. **Generation** → Create tailored resumes for high-scoring jobs
5. **Interview Prep** → Generate personalized prep plans with YouTube links
6. **Review & Submit** → You remain the final human gatekeeper
7. **Tracking** → Monitor application status in dashboard

## 💡 Pro Tips

- **Be specific during onboarding:** Input detailed projects, metrics, and accomplishments
- **Monitor token usage:** Use Haiku for scanning, Sonnet for resume generation
- **Set realistic thresholds:** Don't apply to jobs below 4.0 score
- **Prep early:** Generate interview prep guides 2-4 weeks before interviews
- **Follow YouTube schedule:** Use the 4-week prep plan with curated YouTube channels
- **Review before submitting:** Always verify AI-generated content
- **Keep profiles updated:** Refresh your profile quarterly with new projects
- **India Focus:** 40+ live-verified companies across Greenhouse/Lever/Ashby/SmartRecruiters (200+ in the registry), all hiring in India

## 🔒 Privacy & Security

All user data is stored **locally** on your machine:
- Profile information: `modes/_profile.md`, `config/profile.yml`
- Scanned jobs, evaluations, applications: `data/hunt-job.db` (SQLite — `jobs`, `evaluations`, `applications` tables)
- Generated resumes: `data/resumes/` (never uploaded)

No data is sent to external servers except:
- Job listings (public URLs only)
- Claude API (for analysis)

## 📚 API Reference

### Job Evaluator
```javascript
const evaluator = new JobEvaluator(profile);
const score = await evaluator.evaluate(jobPosting);
// Returns: { score: 4.2, report: {...}, matches: [], mismatches: [] }
```

### Resume Generator
```javascript
const generator = new ResumeGenerator(profile);
const pdf = await generator.generate(jobPosting, resume);
// Returns: PDF file path
```

### Scanner v2
```javascript
import { scanAll } from './src/core/scan/index.js';

const { jobs, newJobs, closed, errors } = await scanAll('DevOps Engineer');
// jobs:    all matching postings across enabled companies (newest first)
// newJobs: subset not seen in a previous scan (real query, not a 48h heuristic)
// closed:  count of previously-active postings the ATS stopped reporting
// errors:  [{ company, error }] per-company fetch failures (non-fatal)
```

### Interview Prep Generator
```javascript
const prep = new InterviewPrep();
const plan = await prep.generatePrepPlan(jobDescription, profile);
// Returns: {
//   focusAreas: [...],
//   conceptsToMaster: [...],
//   interviewRounds: [...],
//   weeklyPlan: {...},
//   behavioralQuestions: [...],
//   youtubeResources: {...}
// }
```

## 🤝 Contributing

This is an open-source project. Feel free to:
- Add new company portals
- Improve evaluation dimensions
- Enhance resume templates
- Submit bug reports

## 📄 License

MIT License - See LICENSE file

## 🆘 Troubleshooting

**Q: API key not working**
A: Ensure ANTHROPIC_API_KEY is set: `echo $ANTHROPIC_API_KEY`

**Q: Resume PDF generation fails**
A: Install Playwright browsers: `npx playwright install`

**Q: Portal scanner returns no results**
A: Check internet connection and company health with `node hunt-job.js audit-portals` — companies auto-disable after 5 consecutive scan failures.

**Q: Profile not saving**
A: Ensure `config/` and `modes/` directories exist and have write permissions

---

**Built with ❤️ using Claude & Claude Code**
**Extended from:** Career-Ops (See project documentation for original features)
