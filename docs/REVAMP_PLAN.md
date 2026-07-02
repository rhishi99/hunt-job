# Hunt-Job — Production Revamp Plan

_Date: 2026-07-02 · Authors: Claude (Fable) + agy/Gemini research + Codex architecture pass · Execute with Sonnet/Opus_

---

## 0. Vision

Turn hunt-job from a working prototype into a **production-grade, fully local** job-hunting machine:

1. **Ingestion**: pull real job data from 10+ ATS platforms via public JSON APIs (not scraping HTML), with a graceful fallback chain for the rest.
2. **One datastore**: SQLite everywhere (already a dependency), kill JSON-file split-brain.
3. **Clean architecture**: service layer + thin CLI, kill the 1000-line God file.
4. **UI revamp**: polished interactive TUI + a local web dashboard (single HTML file, zero cloud).
5. **Seamless apply loop**: scan → score → tailor resume → auto-fill → track, in one flow.

Everything stays on the user's machine. No servers, no telemetry.

---

## 1. Current State Audit (verified against source 2026-07-02)

### What works
- Lever + Greenhouse public APIs scanned in parallel (`src/core/portalScanner.js`) — slugs freshly audited, dead ones pruned.
- SQLite scan cache with TTL + pruning (`src/core/jobCache.js`).
- Multi-provider AI client with retry/fallback: anthropic, openrouter, groq, nvidia, gemini (`src/core/aiClient.js`).
- AutoFill system: platform detection + 4 adapters (Lever/Greenhouse/Workday/SmartRecruiters) + AI generic fallback (`src/core/autoFill/`).
- Resume PDF generation via Playwright + EJS.
- Interview prep generator (1082 lines, feature-rich).

### Problems (prioritized)

| # | Problem | Location | Severity |
|---|---------|----------|----------|
| P1 | **Evaluator never fetches non-Lever URLs** — raw URL string sent to LLM, which hallucinates the evaluation. Root cause of "weak match, no explanation" bug. | `src/core/jobEvaluator.js:82-98` | Critical |
| P2 | **Exact duplicate code**: `buildEvaluationPrompt` + `parseEvaluationResponse` exist as both static AND instance methods (lines 20–71 ≡ 117–168). | `src/core/jobEvaluator.js` | High |
| P3 | **Storage split-brain**: scans in SQLite, evaluations/applications in JSON files (`data/evaluated-jobs.json`, `data/applications.json`) with full read-modify-write on every save. | `jobEvaluator.js:170-188`, `interactive.js` | High |
| P4 | **1001-line God file**: menu, flows, rendering, autofill orchestration all in one. | `src/cli/interactive.js` | High |
| P5 | Only 2 of 12+ ATS platforms ingested; `config/company-portals.json` has 45+ companies with `jobsApiUrl: null` — dead config never scanned. | `portalScanner.js`, config | High |
| P6 | Salary hardcoded `$` in prompts though product is India-focused (₹ LPA). | `jobEvaluator.js:25` | Medium |
| P7 | No retries/backoff/concurrency-limit/ETag caching in scanner; one `fetchWithTimeout`, silent `catch {}` swallows all errors. | `portalScanner.js:142-146` | Medium |
| P8 | Near-zero test coverage: one e2e script, no unit tests despite vitest+jest BOTH in devDeps. | `test/`, `package.json` | Medium |
| P9 | Two launcher menus duplicated (`hunt-job.js` readline menu vs `src/cli/interactive.js` inquirer menu). | both | Medium |
| P10 | Repo hygiene: `bash.exe.stackdump` tracked in git, duplicate docs (`QUICKSTART.md` vs `QUICK_START.md`), Go dashboard = second toolchain for little value. | root | Low |
| P11 | Legacy bugs from launch plan (flatMap crash, `[object Object]`, JSON parse at :60) appear **partially patched** — need verification tests, not fixes. | `interviewPrep.js`, `resumeGenerator.js` | Low |

---

## 2. Ingestion Revamp — "Portal Scanner v2" (biggest win)

### 2.1 Research findings: public ATS JSON APIs (no auth needed)

| ATS | Endpoint pattern | Reliability |
|---|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | High (official) |
| Lever | `api.lever.co/v0/postings/{token}?mode=json` | High (official) |
| **Ashby** | `api.ashbyhq.com/posting-api/job-board/{token}` | High (official) — **add** |
| **SmartRecruiters** | `api.smartrecruiters.com/v1/companies/{id}/postings` | High (official) — **add** |
| **Recruitee** | `{id}.recruitee.com/api/offers` | High — **add** |
| **Workable** | `apply.workable.com/api/v1/widget/accounts/{id}` | Medium — **add** |
| Workday | `{tenant}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` (POST) | Low — CSRF + Akamai; use JSON-LD fallback |
| iCIMS / Eightfold | none | Fallback chain only |
| BambooHR / Zoho / Darwinbox | embed widgets, inconsistent | Fallback chain only |

Politeness rules: 1–2 req/sec per hostname, respect `Retry-After`, use `ETag`/`If-Modified-Since`, honor robots.txt for HTML fetches.

### 2.2 Fallback chain (for companies without a working API)

```
1. ATS JSON API          (registry above)
2. JSON-LD JobPosting    (schema.org markup — even Workday/iCIMS inject it for Google Jobs SEO)
3. sitemap.xml           (extract job URLs → fetch → parse JSON-LD)
4. RSS/Atom              (/feed, /rss)
5. Playwright headless   (last resort — intercept XHR JSON, not DOM scraping; stealth; human delays)
```

**Skip aggregators entirely** (LinkedIn guest endpoints, Naukri, Instahyre, Google Jobs SERP): high ToS risk, Cloudflare Turnstile, IP bans. Direct-to-company is more reliable and legally cleaner.

### 2.3 ATS auto-detection (fixes dead `company-portals.json`)

New `hunt-job detect <careers-url>` + bulk re-audit command:
1. URL regex: `boards.greenhouse.io/(x)`, `jobs.lever.co/(x)`, `*.myworkdayjobs.com`, `jobs.ashbyhq.com/(x)`, `careers.smartrecruiters.com/(x)`
2. CNAME lookup for custom domains (`careers.company.com` → `customboards.greenhouse.io`)
3. DOM fingerprints: `window._grnhse`, `window.Lever`, `.icims-logo`, `div[data-workday]`

Reuses/extends existing `src/core/autoFill/platformDetector.js` — one detector shared by scanner AND autofill.

### 2.4 New provider architecture

```
src/core/scan/
  index.js            # orchestrator: registry → provider fan-out → normalize → upsert
  providers/
    greenhouse.js     # each exports: fetchJobs(companyRef) -> NormalizedJob[]
    lever.js
    ashby.js
    smartrecruiters.js
    recruitee.js
    workable.js
    jsonld.js         # fallback provider (fetch page → parse <script type="application/ld+json">)
  normalize.js        # NormalizedJob shape: {id, company, title, location, url, applyUrl, description, postedAt, source}
  httpClient.js       # fetch + timeout + 2 retries + backoff + per-host rate limit + ETag cache
  detect.js           # ATS detection (shared with autoFill)
```

Company registry replaces both hardcoded arrays and dead JSON: one `companies` table in SQLite (seeded from a cleaned `company-portals.json`), with `ats_platform`, `board_token`, `last_ok_at`, `fail_count` — self-healing (auto-disable after N failures, re-audit command re-enables).

### 2.5 Jobs table (replaces scan-blob cache) — dedup + change detection

```sql
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
```

- Upsert on conflict, update only when `content_hash` changes.
- After each company scan: mark rows not seen this scan as `closed` (soft delete).
- **"NEW since last scan" becomes a real query**, not a 48h heuristic.
- Incremental scans become cheap → enables `hunt-job watch` (cron-style periodic scan + desktop notification).

---

## 3. Storage Consolidation — one SQLite DB

`data/hunt-job.db` (migrate from `job-cache.db` + JSON files):

| Table | Replaces |
|---|---|
| `companies` | hardcoded arrays + `company-portals.json` |
| `jobs` | `scan_cache` blob rows |
| `evaluations` | `data/evaluated-jobs.json` |
| `applications` | `data/applications.json` |
| `documents` (resume/prep artifacts per job) | ad-hoc `data/<slug>/` dirs (keep files, index them) |

One `src/core/db.js` module (open, migrate, close). Migration script reads old JSON → inserts → renames originals to `.bak`. better-sqlite3 already installed — zero new dependencies.

---

## 4. Code Restructure — target module tree

```
hunt-job/
├── hunt-job.js                 # thin arg-parser → dispatch (delete duplicate readline menu)
├── src/
│   ├── core/                   # pure services — NO console I/O, NO inquirer
│   │   ├── db.js               # SQLite singleton + migrations
│   │   ├── aiClient.js         # (keep — already good)
│   │   ├── logger.js           # (keep)
│   │   ├── scan/               # §2.4 provider architecture
│   │   ├── evaluate.js         # jobEvaluator, de-duplicated, fetches JD before LLM
│   │   ├── resume.js           # resumeGenerator
│   │   ├── interviewPrep.js    # split: generation vs rendering
│   │   ├── profile.js          # profileManager + resumeParser
│   │   └── autoFill/           # (keep structure — already the best part)
│   ├── cli/
│   │   ├── interactive.js      # menu SHELL only (~150 lines)
│   │   ├── flows/              # one file per flow, extracted from God file
│   │   │   ├── scanFlow.js
│   │   │   ├── evaluateFlow.js
│   │   │   ├── resumeFlow.js
│   │   │   ├── prepFlow.js
│   │   │   ├── applyFlow.js    # autofill + tracker
│   │   │   └── huntFlow.js     # full workflow
│   │   └── ui.js               # banner, scoreBar, section, colors (shared widgets)
│   └── web/
│       ├── server.js           # node http server, ~100 lines, serves dashboard + JSON API from SQLite
│       └── dashboard.html      # single-file local dashboard (see §5)
├── config/                     # profile.yml, settings.json (companies move to DB)
├── data/                       # hunt-job.db + generated artifacts
└── test/                       # vitest unit tests (see §7)
```

Rules:
- `src/core/*` = pure logic, returns data, throws typed errors. All `console.log`/inquirer lives in `src/cli/`.
- Every core module keeps its named exports for programmatic use (already the pattern).
- Delete: `cmd/dashboard` (Go — second toolchain, superseded by web dashboard), duplicate docs, `bash.exe.stackdump` (+ gitignore it).
- Pick **vitest**, remove jest.

---

## 5. UI Revamp (local only)

### 5.1 CLI polish
- Single entry: `hunt-job` → interactive menu (kill the duplicated readline menu in `hunt-job.js`).
- Consistent widgets (`ui.js`): score bars, spinners (ora already installed via inquirer deps), freshness badges (`🔥 <48h`), color-coded recommendations.
- New commands: `hunt-job watch` (periodic scan + notify), `hunt-job detect <url>`, `hunt-job dashboard` (opens web UI), `hunt-job audit-portals` (re-verify slugs).

### 5.2 Local web dashboard (`hunt-job dashboard`)
- Node `http` server (no express — stdlib is enough) on `localhost:7777`, serving one HTML file + `/api/*` JSON endpoints reading SQLite.
- Views: **Pipeline board** (Scanned → Evaluated → Applied → Interview → Offer, drag between columns), job list with score/freshness filters, evaluation report view, application timeline, profile summary.
- Same design language as existing `resume-builder/index.html` (67KB single-file precedent already in repo).
- Replaces the Go TUI dashboard entirely.

---

## 6. Fix + verify legacy bugs (fast phase)

1. **P1 evaluator fetch** (the real bug): before LLM call, resolve input → if URL: Lever API / Greenhouse API / JSON-LD / Playwright-rendered text extraction. If fetch fails, tell the user "paste JD text" instead of hallucinating. Include reasoning + per-dimension explanations in output rendering (`reasoning` key already in prompt — surface it in CLI).
2. **P2**: delete instance-method duplicates, keep statics.
3. **P6**: currency from profile (`profile.salary.currency`, default ₹, format LPA).
4. **P11**: write regression tests for the 4 launch-plan bugs (flatMap guard, `[object Object]` render, balanced-JSON extraction) — code looks patched; tests lock it in.

---

## 7. Testing strategy

- **vitest** unit tests, no network: providers tested against **fixture JSON** (one real captured response per ATS in `test/fixtures/ats/`).
- Contract test for `NormalizedJob` shape across all providers.
- `normalize`, `isIndiaLocation`, `jobMatchesArchetype`, JSON-extraction helpers: pure-function tests (highest value, zero mocks).
- DB tests against in-memory SQLite (`:memory:`).
- Keep `scripts/e2e-test.js` as smoke test; add `npm run test:live` that hits 2 real boards (Greenhouse gitlab + Lever paytm) — run manually, not in CI.

---

## 8. Execution phases (hand each to Sonnet/Opus as one session)

| Phase | Scope | Deliverable | Est. effort |
|---|---|---|---|
| **1. Foundation** | `db.js` + migrations + migrate JSON→SQLite + repo hygiene (delete stackdump/dup docs/Go dashboard, pick vitest) | One DB, clean repo, `npm test` green | S |
| **2. Scanner v2** | `src/core/scan/` providers (GH+Lever port, +Ashby+SmartRecruiters+Recruitee+Workable), httpClient, jobs table, detection, portal audit command | 4 new ATS platforms, dedup, "new since last scan" | L |
| **3. Evaluator fix** | P1+P2+P6 + JD fetching + explanation rendering + regression tests | Trustworthy scores | M |
| **4. CLI split** | Extract flows from interactive.js, ui.js widgets, single entry point | God file → ~150-line shell | M |
| **5. Web dashboard** | server.js + dashboard.html + pipeline board | `hunt-job dashboard` | M |
| **6. Watch + polish** | `watch` command, JSON-LD fallback provider, docs rewrite | Production-ready | M |

Each phase independently shippable; order matters (2–5 all sit on 1).

### Token-saving prompts for executor sessions
Each phase prompt = "Read docs/REVAMP_PLAN.md §N, implement exactly that scope, run `npm test`." Plan doc is the single source of truth — don't re-explain in chat.

---

## 9. Out of scope (explicitly deferred)

- License/payment system (Firebase + Razorpay) — separate plan in `temp/PRODUCTIZATION_PLAN.md`, build AFTER app is production-grade.
- Aggregator scraping (LinkedIn/Naukri) — ToS risk, rejected.
- Cloud sync, mobile, auto-submit applications (human stays the gatekeeper at submit).

---

## Appendix A — Agent contributions

- **agy (Gemini/Antigravity)**: ATS API research (§2.1–2.3), fallback chain, dedup schema — delivered.
- **Codex**: architecture pass failed — OpenAI usage quota exhausted (resets 2026-07-31). Architecture findings in §1/§4 are from Claude's direct source read instead; resume via `codex resume 019f2316-e99d-7312-a553-b6842a0706a7` if a second opinion is wanted later.
- **Grok**: not installed as an agent in this environment; HTML guide (`docs/hunt-job-guide.html`) generated by Claude instead.
- **Ponytail** (lazy-senior mode): applied throughout — no express (stdlib http), no new deps (better-sqlite3/playwright already present), Go dashboard deleted rather than maintained, one detector shared by scanner + autofill.
