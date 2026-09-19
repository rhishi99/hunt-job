# Hunt-Job — Fable 5.1 answers to the open design questions

Written 2026-09-19 by the Fable 5.1 session (pass 4), answering `docs/fable51-open-questions.md`.
Nothing here is implemented. Every `path:line` was read in this session; every endpoint marked
**verified** was called live from this laptop on 2026-09-19 (raw sweep output in
`scratch/sweep.jsonl`, script `scratch/sweep.mjs`, both gitignored). Anything marked **assumption**
was not verified and must be checked by the implementing agent before it is relied on.

How to read this: §0 is the shared architecture every topic plugs into and the build order for the
subagent army. §1–§7 are the seven topic answers in the order the question doc ranks them
(T1, T3, T2, T6, T7, T4, T5). §8 lists the assumptions in one place.

---

## 0. Shared spine: one job id, one pipeline row, one work queue, one entry point

The seven topics all land on the same four pieces. Build these first (they are T1 + T3's first
slice), then the topics become independent.

### 0.1 Schema migration v5 (append to `MIGRATIONS` in `src/core/db.js:11`)

```sql
-- identity + prefilter on the existing jobs table
ALTER TABLE jobs ADD COLUMN canonical_url    TEXT;      -- normalized (see §2.2)
ALTER TABLE jobs ADD COLUMN prefilter_score  REAL;      -- §1.3 stage S2, 0..1
ALTER TABLE jobs ADD COLUMN prefilter_reason TEXT;      -- 'veto:night_shift' | 'lexical:0.07' | null
ALTER TABLE jobs ADD COLUMN description_state TEXT NOT NULL DEFAULT 'full'; -- 'full' | 'stub' (§4, lazy hydration)
CREATE INDEX idx_jobs_canonical_url ON jobs(canonical_url);

-- one row per job that entered the funnel (hundreds, never 13k)
CREATE TABLE pipeline (
  job_id            TEXT PRIMARY KEY REFERENCES jobs(id),
  state             TEXT NOT NULL,           -- §2.3 state machine
  state_changed_at  INTEGER NOT NULL,
  score             REAL,                    -- latest deterministic score (§3)
  score_version     INTEGER,
  evaluation_id     TEXT,
  resume_document_id INTEGER,
  prep_document_id  INTEGER,
  application_id    TEXT,
  user_label        TEXT,                    -- 'good' | 'bad' | null  (§3.5 cheap outcome)
  repost_of         TEXT,                    -- older jobs.id this appears to re-post (§2.2)
  interview_at      INTEGER,                 -- from T7 calendar parse
  notes             TEXT
);
CREATE INDEX idx_pipeline_state ON pipeline(state);

CREATE TABLE pipeline_events (               -- append-only audit; per-stage timestamps come from here
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id    TEXT NOT NULL,
  from_state TEXT, to_state TEXT NOT NULL,
  actor     TEXT NOT NULL,                   -- 'scan' | 'pipeline' | 'user:cli' | 'user:dashboard' | 'inbox'
  reason    TEXT,                            -- free text / rule id / message_id
  at        INTEGER NOT NULL
);
CREATE INDEX idx_pipeline_events_job ON pipeline_events(job_id, at);

-- durable work queue (§1.4)
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,                 -- 'evaluate' | 'tailor' | 'prep' | 'hydrate' | 'inbox'
  job_id      TEXT,
  key         TEXT NOT NULL UNIQUE,          -- idempotency: kind:job_id:content_hash:profile_hash
  state       TEXT NOT NULL DEFAULT 'queued',-- queued | running | done | failed | blocked
  priority    INTEGER NOT NULL DEFAULT 0,    -- higher first (score-derived for tailor/prep)
  attempts    INTEGER NOT NULL DEFAULT 0,
  not_before  INTEGER NOT NULL DEFAULT 0,    -- unix ms; quota cooldowns land here
  last_error  TEXT,
  payload     TEXT,                          -- JSON
  created_at  INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER
);
CREATE INDEX idx_tasks_runnable ON tasks(state, not_before, priority DESC);

-- LLM call ledger = the budget (§1.5)
CREATE TABLE llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT, task_kind TEXT NOT NULL,
  ok INTEGER NOT NULL, error_class TEXT,     -- 'rate_limit' | 'daily_quota' | 'parse' | 'http' | null
  tokens_in INTEGER, tokens_out INTEGER, ms INTEGER
);
CREATE INDEX idx_llm_calls_day ON llm_calls(at, provider);

-- evaluations get real columns (JSON blob stays for the narrative)
ALTER TABLE evaluations ADD COLUMN job_id        TEXT;
ALTER TABLE evaluations ADD COLUMN content_hash  TEXT;
ALTER TABLE evaluations ADD COLUMN profile_hash  TEXT;
ALTER TABLE evaluations ADD COLUMN model         TEXT;
ALTER TABLE evaluations ADD COLUMN extraction    TEXT;   -- §3.2 JSON facts with evidence
ALTER TABLE evaluations ADD COLUMN score         REAL;
ALTER TABLE evaluations ADD COLUMN score_version INTEGER;
ALTER TABLE evaluations ADD COLUMN recommendation TEXT;
CREATE UNIQUE INDEX idx_evaluations_key ON evaluations(job_id, content_hash, profile_hash, score_version);

ALTER TABLE applications ADD COLUMN job_id TEXT;
ALTER TABLE applications ADD COLUMN evaluation_id TEXT;
ALTER TABLE applications ADD COLUMN resume_document_id INTEGER;
ALTER TABLE applications ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX idx_applications_job_attempt ON applications(job_id, attempt);

ALTER TABLE documents ADD COLUMN content_hash TEXT;      -- JD hash the doc was built from
ALTER TABLE documents ADD COLUMN verification TEXT;      -- §6 JSON per-bullet flags
ALTER TABLE companies ADD COLUMN scan_config TEXT;       -- §4 JSON: {tenant, wd, site, siteNumber, host, keywords}

CREATE TABLE score_versions (version INTEGER PRIMARY KEY, weights TEXT NOT NULL, created_at INTEGER NOT NULL, reason TEXT);
```

Tables for T7 (`inbox_events`) and T5 (`prep_topics`, `prep_progress`, `prep_sessions`) are in §5.3
and §7.2; ship them in the same migration or a v6, either is fine.

### 0.2 Modules to add (no existing file gets rewritten; only `db.js`, `aiClient.js`, `hunt-job.js` change)

```
src/core/pipeline/
  states.js      state list + legal transitions + transition() that writes pipeline + pipeline_events
  identity.js    canonicalUrl(), ensureJobRow(input) → jobs.id for URL / pasted text (§2.2)
  prefilter.js   rules (S1) + lexical evidence score (S2), pure, unit-tested
  queue.js       enqueue(kind, job, payload) / claim() / complete() / fail() / release-stale
  budget.js      remaining(kind) from llm_calls + settings.budget; record() hook for aiClient
  runner.js      drain(): claim → handler → complete, stops on budget/quota/no work
  digest.js      buildDigest(date) → markdown + JSON; printed, written to data/digest/, toast
src/core/scoring/
  extract.js     JD → facts JSON with evidence quotes (the only LLM call in evaluation) (§3.2)
  validate.js    evidence-in-JD checks, skill grounding
  score.js       deterministic aggregation, vetoes, coverage, versioned weights (§3.3)
  narrative.js   matches / mismatches / reasoning built from facts, no LLM
src/cli/run.js   `hunt-job run` — the single entry point (§1.6)
scripts/install-schedule.ps1   copy of install-gig-schedule.ps1 pointing at `run --once`
scripts/migrate-v5-backfill.js hand-migration of the 17 evaluations + 3 applications (§2.5)
```

### 0.3 Build order for the subagent army

Dependencies are real, not preference. Each line is a separately assignable brief.

| # | brief | depends on | topic |
|---|---|---|---|
| 1 | Backlog robustness first: B-04 (JSON mode + repair retry, then throw), B-24 (timed provider cooldown, fail over before sleeping), B-23 (temperature 0 + read `minimumApplyScore`), B-01 (unparseable body throws; zero-jobs-after-many needs two sightings) | — | all |
| 2 | Migration v5 (§0.1) + `states.js` + `identity.js` + `scripts/migrate-v5-backfill.js` | — | T3 |
| 3 | `queue.js` + `budget.js` + `runner.js` + `aiClient` record hook | 1, 2 | T1 |
| 4 | `prefilter.js` S1 rules + S2 lexical; profile `rules:` block (§1.3) | 2 | T1/T2 |
| 5 | `src/cli/run.js` + `digest.js` + `install-schedule.ps1`; `watch`/`hunt`/`gigs` become aliases; fix B-19 docs | 3, 4 | T1 |
| 6 | Scoring v2: `extract.js` + `validate.js` + `score.js` + `narrative.js`; evaluator uses them; extraction fixtures + `hunt-job eval-models` | 1, 2 | T2 |
| 7 | Registry activation, rung 1: apply the verified slug table (§4.6) to `companies`; audit-portals accepts slug-less providers; `scan_config` column | 2 | T6 |
| 8 | Providers: `workday.js` (with lazy `hydrate` task), `oraclehcm.js`, `successfactors.js`, `amazon.js`; detect rungs 2–3 | 3, 7 | T6 |
| 9 | Dashboard reads `pipeline` (kanban, Today, Inbox-review, Prep tabs); PATCH goes through `transition()` | 2 | T3 |
| 10 | Tailoring verifier + `tailor-report.md` + `documents` insert (fixes B-03, B-07, B-12) | 2, 6 | T4 |
| 11 | Inbox: `imapflow` + header rules + match + review queue; calendar parse | 2, 5 | T7 |
| 12 | Prep topics from extraction gaps; checklist; `quiz` | 6, 9 | T5 |
| 13 | Calibration report + bounded weight proposal (`hunt-job calibrate`) | 6, 11 | T2 |

**Status (2026-09-19): all 13 briefs are built and pushed.** Brief 13 is `hunt-job calibrate` + `hunt-job label`
(`src/core/scoring/calibrate.js`).

Briefs 1, 2 and 7 can start in parallel on day one. Brief 7 alone roughly triples scanned companies
with no provider code.

---

## 1. T1 — The autonomous loop

### 1.1 Verdict

Build it as a **durable queue drained by a scheduled `hunt-job run --once`**, not a long-running
daemon. The laptop sleeps; Windows Task Scheduler with `-StartWhenAvailable` already handles "run
when it wakes" (`scripts/install-gig-schedule.ps1:66-72` does exactly this for gigs). Everything the
run does is a queue transition, so a crash, a sleep, or a quota wall mid-run loses nothing.

The funnel is much smaller than 13k suggests. Measured 2026-09-19 on the live DB: of 13,248 active
jobs, titles containing devops/SRE/platform/cloud/infra number 680, and only **179** of those also
carry an India-or-remote-or-empty location. New postings per full scan were 538 on 2026-09-03 across
all titles; the archetype+India share of that is a few dozen. So the LLM stage needs on the order of
**20–60 evaluations a day** after a one-time backlog of ~200, and tailoring/prep run for the handful
that clear 4.0. That fits comfortably inside "a few hundred calls a day, sometimes zero".

### 1.2 Stages and the signal each uses

| stage | signal | code | survivors (measured / expected) |
|---|---|---|---|
| S0 scan | title archetype match + India location (`src/core/scan/normalize.js:84-98`, `:23-38`) | exists, `scanAll` | 13,248 → ~180 active; ~20–40 new per day |
| S1 rules | deterministic dealbreakers, employment type, seniority words, age ≤ 45 days, status active | `prefilter.js` | ~60% pass |
| S2 lexical | evidence overlap between JD and candidate lexicon (skills + bullet terms), 0..1 | `prefilter.js` | all scored; only top-N per day cross to S3, floor 0.15 |
| S3 evaluate | one LLM extraction call + deterministic score (§3) | `scoring/*` | ~30% reach ≥ 4.0 (assumption) |
| S4 prepare | tailor résumé (§6) + prep guide (§7) only for `shortlisted` | existing generators behind `tasks` | 2–8 per day |
| S5 digest | morning summary + toast + dashboard Today | `digest.js` | — |

S1 rules are read from a new structured `rules:` block in `config/profile.yml`. Today the four
dealbreakers are prose (`config/profile.yml:106-110`) and only reach the LLM as advisory text
(`src/core/jobEvaluator.js:194,207`). **Assumption:** the owner will accept this one-time manual
restructuring; the prose stays for the prompt, the rules are what vetoes.

```yaml
rules:
  allowedOnsiteCities: [Pune, Mumbai, Bangalore, Bengaluru]     # onsite-only elsewhere → veto
  vetoTitle:  ['\bL1\b', '\bL2\b', 'support engineer', 'helpdesk', 'noc engineer', 'night shift']
  vetoText:   ['rotational night', 'night shift', '24x7 support', 'ticket queue']       # anchored later by §3 extraction
  minSeniority: senior            # junior/associate/intern titles → veto (15 YOE)
  employmentTypes: [full-time, null]   # gigs mode overrides
  maxAgeDays: 45
```

S2 needs no model and no new dependency: tokenize JD (`cleanHtml` output already stored in
`jobs.description`), tokenize the candidate lexicon (profile `techStack` + `skillGroups` + experience
bullets from `src/core/resumeData.js#defaultResumeData`), apply an alias map (k8s→kubernetes,
ci/cd→cicd, iac→terraform|ansible…), and score `0.6 × (distinct skill hits / distinct skills in JD's
first 3k chars) + 0.4 × BM25-lite over bullets`. It exists to **rank**, not to decide: it orders the
queue so the daily budget is spent on the most promising postings first. Everything under 0.15 is
parked as `filtered_out` with `prefilter_reason='lexical:0.07'` and is re-scoreable with `--rescore`.

Embeddings (`@xenova/transformers`, local CPU) are a possible later S2b; not in the first three
slices because lexical + rules already cut enough and add zero install risk.

### 1.3 Queue semantics (`queue.js`)

- **Idempotency key** `kind:job_id:content_hash:profile_hash` (UNIQUE). Re-running a scan cannot
  enqueue the same evaluation twice; a changed JD (`jobs.content_hash`, set at
  `src/core/scan/index.js:64-66`) creates a new task on purpose.
- **Claim** with a single statement, safe across the scheduled task and a manual run:
  `UPDATE tasks SET state='running', started_at=?, attempts=attempts+1 WHERE id = (SELECT id FROM tasks WHERE state='queued' AND not_before<=? ORDER BY priority DESC, id LIMIT 1) RETURNING *`.
  better-sqlite3 12 bundles SQLite ≥ 3.45, so `RETURNING` is available.
- **Crash recovery**: at run start, any `running` task with `started_at` older than 20 min goes back
  to `queued` (a killed process). Handlers are idempotent because their writes use the same UNIQUE
  keys (`evaluations` key index in §0.1, `documents.content_hash`).
- **Quota**: a handler that gets `error_class='rate_limit'` sets `not_before = now + provider cooldown`
  and returns the task to `queued`; `daily_quota` sets `not_before = next local midnight`. The runner
  exits when `claim()` returns nothing runnable. Three failed attempts of any other class → `failed`,
  surfaced in the digest with `last_error`.
- **Priority**: evaluate tasks carry `prefilter_score × 100`; tailor/prep carry `score × 100` so the
  best match is prepared first when budget is tight.
- **Single writer lock**: `data/run.lock` holding pid + timestamp; stale after 2 h. The scheduled task
  uses `-MultipleInstances IgnoreNew` too, but the lock also covers a human running `run` by hand.

### 1.4 Budget (`budget.js`)

`settings.json` gains `"budget": { "daily": { "evaluate": 150, "tailor": 25, "prep": 25, "inbox": 30 }, "reserve": 0.2 }`.
`remaining(kind)` = daily − count of today's `llm_calls` rows for that kind. `reserve` keeps 20% of
`evaluate` for postings that arrive later in the day (a 3-hourly run should not spend everything at
06:00). Provider caps are not known exactly (the question doc says so); the ledger makes the real
rate visible after a week, and `hunt-job budget` prints the last 7 days per provider so the numbers
can be tuned from measurement instead of guessed.

`aiClient.getActiveClient().messages.create` (`src/core/aiClient.js:220-249`) gets one line after
success and one in the catch that calls `budget.record()`. That is the whole integration; every LLM
path already goes through it.

### 1.5 What the user sees each morning

`data/digest/2026-09-19.md` (also printed, also a toast via the existing `notify()` in
`src/cli/watch.js:45-73`, also `GET /api/digest` for the dashboard Today tab):

1. **Ready to apply** — company, title, score, coverage %, link, résumé path, prep path, number of
   flagged bullets in the tailor report.
2. **Evaluated, maybe** — score 3.0–3.9 with the top mismatch each.
3. **Waiting** — queued evaluations, tailors, preps; whether blocked on quota and until when.
4. **Health** — companies that failed this scan, companies auto-disabled, tasks `failed` with reason.
5. **Inbox** (once T7 exists) — auto-applied outcomes and items needing a one-click review.

### 1.6 One entry point

`hunt-job run` in `src/cli/run.js`:

```
hunt-job run [--once | --loop <min>] [--gigs] [--no-llm] [--rescore] [--budget-only]
```

- Default archetypes = all of `profile.archetypes` (the way `gigs` already fans out, `src/cli/gigs.js`),
  so one scan serves every archetype.
- `--gigs` swaps the S1 rule set (commitment part-time/contract, all locations), same queue.
- `--no-llm` = scan + prefilter + digest only (today's `watch --once`).
- `watch`, `hunt`, `gigs` stay as one-line aliases in `hunt-job.js` for one release, then go. `hunt`
  today calls a no-op `evaluateJobs()` (`src/cli/hunt.js:35`) and prints a dead file path; delete it
  rather than fix it (B-19).
- `scripts/install-schedule.ps1` registers `HuntJob-Run` every 3 h with the same settings as the gig
  script. 3 h, not 30 min: the ATS boards change slowly and the aggregator sources are cached for 6 h
  anyway (`src/core/scan/index.js:32-35`).

### 1.7 Failure modes and their handling

- **Quota hits zero mid-run** → tasks parked with `not_before`, run exits 0, digest says "blocked
  until 00:00". Next scheduled run continues. No work re-done.
- **Provider swaps model family mid-batch** → §3 makes the score deterministic from an extraction
  that is validated against the JD text, so the swap changes little; the model is stored per row.
- **Scan returns garbage for a company** → B-01 keeps soft-close from wiping the company; the
  pipeline never moves a job to `expired` unless the company scan succeeded (`markCompanyOk` path,
  `src/core/scan/index.js:217`).
- **Laptop off for three days** → `-StartWhenAvailable` fires once on wake; backlog is bounded by
  the budget; digest for the missed days is generated for the current day only.
- **Same posting re-listed under a new id** → §2.2 `repost_of`; evaluation reused when
  `content_hash` matches, no LLM call.

### 1.8 First slice (one day)

Brief 3 + brief 5 minus tailor/prep: migration v5, `queue.js`, `budget.js`, `runner.js`,
`run --once` that (a) runs `scanAll(profile.archetypes)`, (b) inserts `pipeline` rows as
`discovered` for new matches, (c) applies S1 rules, (d) enqueues `evaluate` for the rest with the
**existing** `JobEvaluator` as the handler (reuse-by-key gives B-18 for free), (e) drains up to
`budget.evaluate`, (f) prints the digest. Ship with B-04 and B-24 already in, or the first quota wall
will produce score-0 rows.

---

## 2. T3 — Job identity and pipeline state model

### 2.1 Verdict

**`jobs.id` is the identity.** Every evaluation, document and application gets a `job_id`. Pasted text
and foreign URLs become real `jobs` rows under a `manual:` platform, so nothing needs a second id
space. The `job_${Date.now()}` ids (`src/core/jobEvaluator.js:268`) and the URL-string joins in
`src/web/server.js:76,99,102` and `src/cli/flows/applyFlow.js:30` go away.

### 2.2 The key, re-posts, redirects and tracking parameters

- `canonicalUrl(u)` in `identity.js`: lowercase scheme+host, drop fragment, drop query keys matching
  `/^(utm_|gh_src|gh_jid|lever-(source|origin)|source|ref|src|trk)$/`, collapse trailing slash. Stored
  in `jobs.canonical_url` for every row (backfill in migration v5 from `url`, then `apply_url`).
- `ensureJobRow(input)`:
  1. URL → `resolveJobText` (`src/core/jobEvaluator.js:127-165`, already handles Lever, Greenhouse,
     JSON-LD, generic) → look up `jobs` by `canonical_url` in (`url`, `apply_url`, final redirected
     URL). Hit → that id (fixes B-25 by reading `description` from the row).
  2. Miss → insert `manual:<host>:<sha256(canonical_url)[:16]>`, `ats_platform='manual'`,
     `company_id='manual'`, `employer` from the fetched text's company line when present.
  3. Pasted text → `manual:text:<sha256(normalized text)[:16]>`. Same text pasted twice = same row.
- **Re-post**: the ATS gives a new external id, so a new `jobs.id`. Do not merge. When a new
  `discovered` row has the same `company_id` and the same normalized title as a row closed within 60
  days, set `pipeline.repost_of` and show "re-posted, previously evaluated 3.8 on 12 Aug" in the
  digest. If the new row's `content_hash` equals the old one's, the old evaluation is copied (no LLM).
- **Redirects**: `resolveJobText` already follows them; store the final URL as `apply_url` for
  `manual:` rows so the auto-fill opens the right page.

### 2.3 States, transitions, actors

```
discovered ──(S1 veto | lexical floor)──▶ filtered_out
discovered ──(pipeline)──▶ queued ──(evaluate done)──▶ evaluated
evaluated  ──(score < 3.0)──▶ skip
evaluated  ──(3.0 ≤ score < threshold)──▶ maybe
evaluated  ──(score ≥ threshold)──▶ shortlisted ──(tailor+prep done)──▶ prepared
maybe | shortlisted | prepared ──(user opens apply flow)──▶ applying ──(user confirms submit)──▶ applied
applied ──(inbox ack | user)──▶ acknowledged ──▶ screening ──▶ interview ──▶ offer
applied…interview ──(inbox reject | user)──▶ rejected
any pre-applied state ──(scan soft-close, company scan OK)──▶ expired
any ──(user)──▶ withdrawn | archived
rejected | expired | withdrawn ──(new jobs.id, or ≥ 90 days)──▶ queued   (re-apply, attempt+1)
evaluated…prepared ──(jobs.content_hash changed)──▶ queued            (JD changed, re-evaluate)
```

`states.js` holds the transition table as data (`{from, to, actors[]}`), and `transition(jobId, to,
actor, reason)` refuses anything not in it, writes `pipeline` and `pipeline_events` in one SQLite
transaction. The dashboard PATCH (`src/web/server.js:110-117`, currently set-membership only) and
the CLI prompt (`applyFlow.js:113-118`) both call it. T1 moves rows with `actor='pipeline'`, T7 with
`actor='inbox'`; the events table gives per-stage timestamps without extra columns.

"Reapply after rejection" is allowed, deliberately gated: same `jobs.id` needs 90 days; a re-post is
a new id and can be applied to right away, but the digest shows the earlier outcome next to it.

### 2.4 Evaluation reuse vs recompute

Reuse when (`job_id`, `content_hash`, `profile_hash`, `score_version`) matches (UNIQUE index in §0.1).
`profile_hash` = sha256 of the profile fields the scorer reads (archetypes, rules, techStack, salary,
yearsOfExperience). Model is **not** part of the key: §3 stores the model for audit but treats the
extraction as replaceable. `--fresh` bypasses. A new `score_version` re-scores from the stored
extraction without any LLM call, because extraction and scoring are separate rows/columns.

### 2.5 Migration of today's rows (`scripts/migrate-v5-backfill.js`)

Small enough to script once and print a report; do not hand-edit the DB.

- 17 `evaluations` / 9 distinct inputs (measured). 5 are URLs (Lever paytm ×2, Greenhouse inmobi ×2,
  SmartRecruiters Bosch) → `ensureJobRow` gives a `jobs.id` (existing row if the scan has it, else
  `manual:`). 4 are pasted texts stored in `url` → `manual:text:` rows. Set `job_id`,
  `content_hash = sha256(text)`, `profile_hash = 'legacy'`, `score = evaluation.overallScore`,
  `score_version = 0`, `model = null`. Keep all 17 (history); the pipeline row points at the latest per
  job.
- 3 `applications`: Paytm ×1, InMobi ×2 (same job, 4 minutes apart, `app_1782930127959` and
  `app_1782930363487`). Keep the first as `attempt=1`, delete the second (it is the check-then-insert
  race the question doc describes). Set `job_id` via URL. Create `pipeline` rows in `applied`.
- The 0 rows in `documents` need nothing.

### 2.6 Kanban without 13k rows

`GET /api/pipeline?states=…` reads `pipeline JOIN jobs` (hundreds of rows). The 6 fixed columns in
`dashboard.html:849,856` become the state list from `states.js` grouped into lanes: Discovered
(discovered, queued), Evaluated (evaluated, maybe, skip collapsed), Shortlisted (shortlisted,
prepared), Applied (applying, applied, acknowledged, screening), Interview, Offer, Closed
(rejected, expired, withdrawn, archived). `getJobs` (`src/web/server.js:50-70`) stops loading every
job and every evaluation blob; it pages with SQL (B-10 for the API).

---

## 3. T2 — A grounded, reproducible, learning score

### 3.1 Verdict

Split evaluation into **extraction** (the only LLM call, returns facts with evidence quotes) and
**scoring** (pure code, versioned weights, hard vetoes, explicit unknowns). The number becomes
comparable across Groq/NVIDIA/OpenRouter/Gemini because the model only has to copy facts out of a
document, and every fact it returns is checked against the document. Learning from outcomes is a
monthly, human-approved weight change, never an automatic fit.

Drop four of the current dimensions as scored numbers: culture, team dynamics, work-life balance,
product-market fit are rarely stated in an Indian JD and have no "unknown" option today
(`src/core/jobEvaluator.js:197-208`). They survive only as extracted **signals** (on-call, 24×7,
rotational, contract-to-hire) that feed vetoes or the narrative.

### 3.2 Extraction (`scoring/extract.js`, `validate.js`)

One prompt: JD text (up to 12k chars; the stored descriptions average 3.1k, max 17.7k — measured) plus a
JSON schema, temperature 0, JSON mode (B-04), `light` model tier first, `heavy` only on validation
failure. No résumé in the prompt: the résumé enters in code. Output:

```json
{
  "role_title": {"value": "…", "evidence": "…"},
  "seniority": {"value": "junior|mid|senior|staff|lead|manager|unstated", "evidence": "…"},
  "years_required": {"min": 8, "max": null, "evidence": "8+ years"},
  "must_have_skills": [{"value": "kubernetes", "evidence": "…"}],
  "nice_to_have_skills": [{"value": "…", "evidence": "…"}],
  "responsibilities": ["…", "…", "…"],
  "location": {"mode": "onsite|hybrid|remote|unstated", "cities": ["Pune"], "countries": ["India"], "evidence": "…"},
  "salary": {"min": null, "max": null, "currency": null, "period": null, "evidence": null},
  "employment_type": {"value": "full-time|contract|…|unstated", "evidence": "…"},
  "signals": {"night_shift": false, "rotational_shift": false, "on_call": true, "support_queue": false, "presales": false, "evidence": {"on_call": "…"}},
  "role_nature": {"value": "engineering_ownership|consulting|presales|support|unclear", "evidence": "…"}
}
```

`validate.js` rejects any field whose `evidence` is not a substring of the JD after whitespace/case
normalization (the field becomes `unstated`, flag `unverified`), and any skill not found in the JD
text by substring or alias. Evaluation rows record `extraction_validity` = fraction of fields that
passed. Below 0.6 → retry once on the `heavy` tier, then mark the evaluation `low_confidence`.

### 3.3 Deterministic score (`scoring/score.js`)

Vetoes first (any → score 0, `recommendation='Skip'`, `pipeline.state='filtered_out'`, reason):
onsite-only outside `rules.allowedOnsiteCities`; `night_shift` or `rotational_shift` true; `role_nature
= support`; `seniority ∈ {junior}`; employment type outside `rules.employmentTypes`. The fourth
dealbreaker (no cloud/CI-CD ownership) is a strong penalty, not a veto: it depends on inference.

Components, each 0..1 or `null` (unknown):

| component | weight | value |
|---|---|---|
| skill_fit | 0.40 | 0.6·(must-have covered by candidate lexicon) + 0.2·(nice-to-have covered) + 0.2·(core stack present: cloud, ci/cd, containers, iac) |
| seniority_fit | 0.15 | table by profile years (15): staff/lead/senior 1.0, manager 0.7, mid 0.5, unstated null |
| location_fit | 0.20 | remote 1.0; hybrid in allowed city 0.9; onsite in allowed city 0.7; unstated null |
| salary_fit | 0.10 | stated and overlaps profile range 1.0; above 1.0; below min 0.2; unstated null |
| role_scope | 0.10 | engineering_ownership 1.0; consulting 0.7; presales 0.4; unclear null |
| freshness | 0.05 | ≤ 7 days 1.0 … ≥ 45 days 0.3, from `jobs.posted_at` |

`score = 1 + 4 × Σ(w_i · v_i) / Σ(w_i for v_i ≠ null)`; `coverage = Σ(w_i for v_i ≠ null)`. The digest
prints "4.2 on 85% of criteria". A score computed on coverage < 0.5 can never be `Apply`; it is
`Maybe` with "salary and location unstated" as the mismatch. `minimumApplyScore` is read from
`settings.json` (B-23). Weights live in `score_versions` (version 1 = the table above); the row id is
stored on every evaluation.

Salary: keep the profile's 40–70 LPA but mark it **assumption** in the digest header until the owner
confirms; conversion uses a fixed `settings.fx.USD_INR` (updated by hand) and normalizes per-annum.
Most Indian postings will be `null` here, which is exactly why `salary_fit` is excluded from the
denominator instead of guessed.

### 3.4 Narrative without a second call (`scoring/narrative.js`)

`matches` = covered must-haves, location mode, seniority; `mismatches` = missing must-haves (these
are T5's raw material), unknowns, penalties; `reasoning` = one template sentence. Same shape the
dashboard already renders (`src/web/server.js:85-95`).

### 3.5 Comparable across free models

- Extraction fixtures: 12 real JDs from `jobs.description` (mix of the six platforms) with a
  hand-checked gold extraction in `test/fixtures/extraction/`. `hunt-job eval-models` runs each
  available provider and prints per-field agreement (skill F1, enum exact match). The provider
  `priorityOrder` for the `evaluate` task kind is set from that report, not from taste.
- `evaluations.model` and `extraction_validity` on every row; the digest shows the model.
- Temperature 0 everywhere (B-23). JSON mode where the provider supports it (B-04).

### 3.6 Learning from 10–50 outcomes a month

Two signals, both cheap: (a) `pipeline_events` outcomes (acknowledged / screening / interview / offer /
rejected), from T7 or the user; (b) `pipeline.user_label` good/bad via `hunt-job label <job> good`
and a thumbs button in the dashboard, applied to shortlisted rows the user did or did not want. Labels
arrive in hours, employer outcomes in weeks; both count.

`hunt-job calibrate` (monthly, or on demand): for each component, mean value among positives
(interview/offer/good) vs negatives (rejected-before-interview/bad), with n per class. When n ≥ 15
per class and the gap is consistent (positives higher by ≥ 0.15), it proposes `w_i × 1.25`
(bounded to [0.5×, 2×] of version 1), renormalized, written to the digest as a proposal. The user
runs `hunt-job calibrate --accept` to create the next `score_versions` row; every pipeline row is
re-scored from stored extractions (no LLM) and the digest shows what moved across the threshold.
Drift cannot happen silently: weights change only on explicit accept, every version is kept, and
`--version N` re-scores retroactively for comparison. This is a calibration report with a guarded
knob, not a model, which is the honest thing to build at this sample size.

### 3.7 First slice

Brief 6 without calibration: `extract.js` + `validate.js` + `score.js` + `narrative.js`, evaluator
calls them, fixtures with 6 JDs, `eval-models` command. Prompt cost per evaluation drops from ~2.5k
to ~1.5k tokens because the profile block leaves the prompt.

---

## 4. T6 — Activating the 193 unscanned companies

### 4.1 Verdict and what was measured

The sweep on 2026-09-19 (`scratch/sweep.mjs`, results `scratch/sweep.jsonl`) probed every unscanned
company three ways: slug guesses against the six existing provider APIs, Workday tenant hosts, and a
landing-page marker grep. Result:

- **~40 companies already have a public board on a platform we scan** (Greenhouse, Lever, Ashby,
  SmartRecruiters). They need a registry row, not code. That is rung 1 below.
- **~25 companies are on Workday**, whose public JSON is verified below. One new provider covers them.
- **7 on Oracle Cloud HCM** (verified JSON, no detail call needed), **5 on SuccessFactors** (server
  HTML list + JSON-LD job pages, verified), **Amazon** (verified JSON with full descriptions).
- Vanity career pages are JS-rendered: the marker grep found tokens on only ~30 of 187 landing pages.
  So "read the HTML" is a weak rung; "guess and verify" and "ask robots.txt" are the strong ones.
- Slug guessing produces **false positives that only a name check catches**: Greenhouse `tcs` is
  "Thornbury Community Services", `linkedin` is "LI Test Company", `bcg` is "Bohen Consulting Group",
  `porter` is "Porter Works", `wise` is "Wise Worksite Field Sales" (all verified via
  `GET boards-api.greenhouse.io/v1/boards/{slug}` → `name`). SmartRecruiters `postings[].company.name`
  and `location.country` confirmed Swiggy (in), Freshworks, Uber (us, 1 job), Wise (gb), Grab (vn),
  Whatfix (in). Recruitee `google`/`accenture`/`meta` subdomains are unrelated small companies.
  **Automatic slug acceptance must require a name match.**

### 4.2 Detection ladder (per company, run by `audit-portals --deep`, never during `scan`)

| rung | method | cost | verifies itself by |
|---|---|---|---|
| 0 | URL regex on `career_url` (`src/core/scan/detect.js:16-46`, exists) | 0 | — |
| 1 | slug guess: name → `{words joined, hyphenated, first word}` → GET the six provider list endpoints (`providers/*.js:24-36` URLs) | ≤ 18 GETs, one-time | Greenhouse `/v1/boards/{slug}.name`; SmartRecruiters `postings[0].company.name`; Recruitee `offers[0].company_name`; Lever/Ashby/Workable: HTML `<title>` of `jobs.lever.co/{slug}`, `jobs.ashbyhq.com/{slug}`, `apply.workable.com/{slug}`. Accept when normalized-token containment or Jaccard ≥ 0.5 against `companies.name` minus "India"; else `needs_review` |
| 2 | landing-page marker regex (fix `detect.js:48-71` to capture the token, not just the platform): Workday `([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com(/[A-Za-z0-9_-]+)?`, Greenhouse `job-boards.greenhouse.io/{slug}` (found `razorpaysoftwareprivatelimited`), Ashby, Oracle `.fa.{region}.oraclecloud.com`, SuccessFactors, Eightfold, Phenom, iCIMS, Darwinbox, Keka, JSON-LD JobPosting count | 1 GET | rung-specific verify call |
| 3 | Workday robots: for `wd ∈ {wd1, wd3, wd5, wd12, wd103, wd10, wd2, wd8}` GET `https://{slug}.{wd}.myworkdayjobs.com/robots.txt`; a `Sitemap: https://{tenant}.{wd}.myworkdayjobs.com/{site}/siteMap.xml` line gives tenant, host and site in one shot (verified for 27 tenants, table in §4.4; Fidelity answers on `wd1.myworkdaysite.com/recruiting/fmr/FidelityCareers`, a second host form). Two caveats: robots lists **one** site and tenants can have several (pwc robots → `Global_Campus_Careers`, but `Global_Experienced_Careers` answers 254 devops jobs; sprinklr robots → `intern_newgrad`); and it misses some live tenants (redhat.wd5/jobs and zoom.wd5/Zoom answer CXS but have no robots sitemap line), so after robots also try the site-name guesses `External, Careers, {Tenant}, {Tenant}Careers, External_Career_Site, jobs` | ≤ 8 GETs + ≤ 6 POSTs | POST the CXS list endpoint, expect `total` |
| 4 | Playwright network sniff, audit-only, bounded: load `career_url`, 20 s, headless, record JSON responses whose body has ≥ 3 objects with a `title`/`name` key; store request template in `companies.scan_config`; a generic `recorded.js` provider replays it | 1 browser load per audit | replay returns ≥ 1 job |
| 5 | `ats_platform='unscannable'`, keep `career_url` for the human | 0 | — |

`src/cli/auditPortals.js:45` must stop rejecting results without a slug: `jsonld`, `workday`,
`oraclehcm`, `successfactors`, `amazon`, `recorded` carry their config in `scan_config`, and
`loadEnabledCompanies` (`src/core/scan/index.js:53-60`) should ask the provider (`needsSlug`) instead
of hardcoding `jsonld`.

### 4.3 New providers, ranked by verified India-relevant volume

**1. `workday.js` (verified).** List: `POST https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
with `{"appliedFacets":{},"limit":20,"offset":0,"searchText":"devops"}` → `{ total, jobPostings:
[{ title, externalPath, locationsText, postedOn, bulletFields:["JR2020488"], remoteType? }] }`.
Detail: `GET …/wday/cxs/{tenant}/{site}{externalPath}` → `jobPostingInfo.{ id, title, jobDescription
(HTML), location, additionalLocations, postedOn, startDate, timeType, jobReqId }`. Facets are
tenant-configured (NVIDIA exposes no country facet), so filter by `searchText` per archetype keyword
and by `locationsText`; treat "N Locations" as ambiguous and fetch the detail. `postedOn` is relative
("Posted 10 Days Ago"; "30+ Days Ago" → null). `externalId = bulletFields[0] || last path segment`.
Job URL = `https://{tenant}.{wd}.myworkdayjobs.com/{site}{externalPath}` (**assumption**: some
tenants prefix `/en-US`; verify per tenant during audit and store the prefix in `scan_config`).
Cost per company per scan: 6 keyword lists × ~2 pages + detail only for archetype+India-ish or
ambiguous rows (cap 40) → 10–50 requests. Rows without a fetched description are stored with
`description_state='stub'` and a `hydrate` task; S2/S3 wait for hydration. Measured `total` for
`searchText:"devops"` (all locations): Accenture 2000 (cap), PwC 254, DXC 123, Mastercard 115, Intel
81, Salesforce 61, Visa 47, Workday 46, Red Hat 33, CrowdStrike 30, Adobe 25, Micron 25, Autodesk 18,
Zoom 7, Zendesk 3, BrowserStack 1. India share unknown (**assumption** 20–40% for the IT-services
tenants, lower for product companies).

**2. `oraclehcm.js` (verified).** `GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber={site},limit=25,offset={n},keyword={kw},location=India`
→ `items[0].{ TotalJobsCount, requisitionList:[{ Id, Title, PostedDate, PrimaryLocation,
PrimaryLocationCountry, WorkplaceType, JobFamily, ShortDescriptionStr, ExternalQualificationsStr,
ExternalResponsibilitiesStr }] }`. The three `*Str` fields are the description; **no detail call**.
JPMorgan (`jpmc.fa.oraclecloud.com`, `CX_1001`) returned 134 for devops+India. Host and `siteNumber`
come from the landing marker (`…/hcmUI/CandidateExperience/en/sites/CX_1001/…`). Registry: Oracle,
Texas Instruments (us2), JPMorgan, KPMG (em2), Zensar, Hexaware, Honeywell (ocs). Job URL =
`https://{host}/hcmUI/CandidateExperience/en/sites/{site}/job/{Id}` (**assumption**, verify).

**3. `successfactors.js` (verified structure).** List is server-rendered HTML:
`GET https://{host}/search/?q={kw}&locationsearch=India&startrow={n}` → anchors
`a.jobTitle-link[href="/job/{slug}/{id}/"]`, 5–25 per page, `startrow` pagination. Each job page
carries one JSON-LD `JobPosting` block (verified on jobs.sap.com), which `providers/jsonld.js#parse`
already reads. Registry: SAP, Wipro (careers.wipro.com is SuccessFactors, marker verified), Ericsson,
NetApp, EY. This is stable vendor markup rather than scraping a bespoke page; still, cap detail fetches
at 50 per company per scan and cache by URL.

**4. `amazon.js` (verified, unofficial).** `GET https://www.amazon.jobs/en/search.json?base_query={kw}&country=IND&result_limit=100&offset={n}`
→ `{ hits, jobs:[{ id, id_icims, title, description, basic_qualifications, preferred_qualifications,
normalized_location, posted_date, job_path, job_schedule_type, updated_time }] }`. Full description in
the list; one company but very high India volume. It is not a published API: keep it behind the
existing `fail_count` quarantine and expect to fix it when Amazon changes it.

**5. Not now.** Eightfold (`/api/apply/v2/jobs` answered "Not authorized for PCSX" on Qualcomm;
Qualcomm is actually Workday `qualcomm.wd12/External`, verified) — only Amex remains, skip. Phenom
(Cisco): page is fully client-rendered, rung 4 only. Google, Apple, Uber, Microsoft internal JSON
endpoints all failed or were empty from curl — drop them; rung 4 or rung 5. iCIMS (GitHub, Booking,
Arm): 3 companies, HTML search + JSON-LD job pages, **unverified**, later. Darwinbox / Keka Indian
startups (BigBasket, PharmEasy, Porter, CleverTap, Jupiter): rung 4.

### 4.4 Registry updates with zero provider code (rung 1 results, name-verified unless noted)

| platform | slug (jobs at sweep time) |
|---|---|
| greenhouse | anthropic (605), gitlab (216), stripe (665), databricks (877), thoughtworks (40), twilio (146), airbnb (168), elastic (358), mongodb (402), groww (8), datadog (453), cloudflare (379), okta (323), figma (152), coursera (21), zscaler (368), reddit (154), pagerduty (49), amplitude (37), newrelic (45, verify name), razorpaysoftwareprivatelimited (from landing marker, verify) |
| lever | spotify (70), pocketfm (6) |
| ashby | snowflake (345), confluent (21), notion (128) |
| smartrecruiters | swiggy (106), freshworks (137), servicenow (644), canva (247), grab (423), wise (428), ixigo (8), unacademy (3), whatfix (1), cars24 (1), nobroker (1); uber (1, US only — skip) |
| workday (tenant.wd / site), all verified by robots.txt and/or a CXS `total` | accenture.wd103/AccentureCareers, intel.wd1/External, autodesk.wd1/Ext, browserstack.wd3/External, mastercard.wd1/CorporateCareers, visa.wd5/Visa, zendesk.wd1/zendesk, dxctechnology.wd1/DXCJobs, redhat.wd5/jobs, workday.wd5/Workday, adobe.wd5/external_experienced, zoom.wd5/Zoom, crowdstrike.wd5/crowdstrikecareers, salesforce.wd12/External_Career_Site, pwc.wd3/Global_Experienced_Careers (robots names the campus site), micron.wd1/External, nvidia.wd5/NVIDIAExternalCareerSite, ms.wd5/External (Morgan Stanley), db.wd3/DBWebsite (Deutsche Bank), barclays.wd3/External_Career_Site_Barclays, blackrock.wd1/BlackRock_Professional, gevernova.wd5/Vernova_ExternalSite, hp.wd5/ExternalCareerSite, marvell.wd1/MarvellCareers, infosys.wd103/BLS_Careers, broadcom.wd1/External_Career (VMware), qualcomm.wd12/External, sprinklr.wd1/intern_newgrad (campus site; find the experienced one), fmr on `wd1.myworkdaysite.com/recruiting/fmr/FidelityCareers` (CXS path for this host form is an assumption); paloaltonetworks.wd5 and citi.wd5 hosts found, site unknown → rung 3 guesses. Not found on any probed host (so not Workday, or a tenant name we did not guess): nokia, hsbc, dell, informatica, capgemini, cognizant, deloitte, ibm, intuit, akamai, goldmansachs, ubs, wellsfargo, walmart, siemens, westerndigital, nutanix, thoughtspot, dynatrace, hubspot, shopify, revolut, atlassian, hcl, techmahindra, ltimindtree, mphasis, persistent, coforge, mckinsey, bain, standardchartered, bnpparibas, nomura → rung 4 |
| oraclehcm | oracle (us2), texas instruments (us2), jpmc (CX_1001), kpmg (em2), zensar, hexaware, honeywell (ocs) — hosts from landing markers, sites to confirm |
| successfactors | sap, wipro, ericsson, netapp, ey |
| icims (later) | github, booking, arm |
| darwinbox / keka (rung 4) | bigbasket, pharmeasy, porter, clevertap / jupiter |

Numbers are board totals across all locations; the India share is what S0 filters.

### 4.5 First slice

Brief 7: a script that inserts the rung-1 rows above after re-running the name check, plus the
`scan_config` column and the `needsSlug` change in `loadEnabledCompanies`. Then brief 8 starts with
`workday.js` (largest company count) and `oraclehcm.js` (cheapest: no detail call).

---

## 5. T7 — Capturing outcomes without typing

### 5.1 Verdict

**IMAP on the user's own Gmail with an app password**, polled inside `run --once`, headers first,
bodies only for candidates, nothing but classification metadata stored. Not the Gmail API: it needs an
OAuth client in a Google Cloud project, which is friction the owner has explicitly avoided around
Google billing even though a no-billing project would be allowed. Not ATS candidate portals: each has
its own login and no public status API. Calendar invites arrive as `text/calendar` parts in the same
mailbox, so the same poll covers interviews.

Dependency: `imapflow` (MIT). **Assumption:** 2-Step Verification is on for the account so an app
password can be created; credentials go in `.env` as `IMAP_HOST/IMAP_USER/IMAP_PASS`. Optional and
recommended: a Gmail filter that labels job mail `hunt-job`; when `IMAP_LABEL` is set, only that
folder is searched, which shrinks the privacy surface to mail the user already routed there.

### 5.2 Classification and matching

1. Search `SINCE last_sync` (stored in `settings`/`state` table), fetch ENVELOPE + BODYSTRUCTURE
   only.
2. Rules on headers: sender domain ∈ ATS mailer list (`greenhouse-mail.io`, `hire.lever.co`,
   `lever.co`, `ashbyhq.com`, `smartrecruiters.com`, `myworkday.com`, `myworkdayjobs.com`,
   `icims.com`, `oraclecloud.com`, `successfactors.com`, `eightfold.ai`, `phenom.com`,
   `amazon.jobs`) **or** sender domain / display name matches a company with a pipeline row in
   `applied…interview` within 120 days. Subject regexes: `application (received|submitted)|thank you
   for applying` → acknowledged; `unfortunately|not (be )?moving forward|other candidates|regret` →
   rejected; `interview|schedule|availability|meet (with )?the team` → interview;
   `\boffer\b` → offer (always needs_review).
3. Match to a pipeline row: score = company-name tokens in from/subject/snippet (alias map from the
   registry name) + title tokens; a unique best above threshold → automatic `transition(…,
   actor='inbox', reason=message_id)`. Ties, no match, or an outcome that would move a row backwards
   → `needs_review`.
4. Only when rules give a domain match but no outcome: one `light` LLM call on subject + first 300
   chars of the text part, JSON `{outcome, confidence}`; budget kind `inbox`.
5. `text/calendar` part → tiny ICS parse (DTSTART, SUMMARY, ORGANIZER; no dependency) →
   `pipeline.interview_at`, state `interview`.

### 5.3 Storage and privacy

```sql
CREATE TABLE inbox_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE, received_at INTEGER, from_domain TEXT, subject TEXT,
  outcome TEXT, confidence REAL, matched_job_id TEXT, matched_by TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0, snippet TEXT,  -- ≤ 300 chars, only for needs_review rows
  applied INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL
);
```

No bodies, no attachments, no addresses beyond the domain. `hunt-job inbox --purge 90` deletes
resolved rows older than 90 days. The digest lists auto-applied outcomes (reversible: the user can
`hunt-job move <job> <state>` and the event log keeps both) and a needs_review list; the dashboard
Inbox tab offers assign / ignore per row.

### 5.4 Failure modes

Newsletters from a company the user applied to → require an outcome regex, not just a domain match.
"Unfortunately" in a non-rejection → rejection is auto-applied only from `applied`/`acknowledged`/
`screening`; from `interview` it goes to needs_review. Two open applications at one company → tie →
needs_review. Mailbox unreachable → the stage logs and the run continues; nothing else depends on it.

### 5.5 First slice

`imapflow` connect, header search, rule classification, match, needs_review list in the digest. No LLM,
no calendar. Roughly one day.

---

## 6. T4 — Tailoring that is provably truthful

### 6.1 Verdict

Keep the LLM as a **rewriter of one bullet at a time** and make code the judge: each returned bullet
must name its source bullet, and a verifier accepts it only if every number, every named tool and
every employer/date token in the rewrite already exists in the source bullet or the candidate
lexicon. Anything that fails keeps the source bullet verbatim. A second-model entailment check is
advisory only. This is the strongest guarantee available without a human, and it costs zero extra LLM
calls on the happy path.

### 6.2 Contract change to `generateTailored` (`src/core/resumeGenerator.js:96-146`)

Output schema gains `source_index` per bullet and forbids count changes (already asked in prose at
`:123-128`; now enforced):

```json
{ "summary": "…", "skills": ["…"],
  "experience": [{ "company": "…", "bullets": [{ "source_index": 0, "text": "…" }] }] }
```

`mergeTailored` (`src/core/resumeData.js:200-222`) is replaced by `mergeVerified(base, tailored,
report)` that only merges bullets the verifier passed; `skills` becomes an ordering of
`base.skills` (B-07: intersection with alias map, never a superset).

### 6.3 Verifier (`src/core/tailor/verify.js`, pure, fixture-tested)

Per bullet, `source = base.experience[i].bullets[source_index]`:

- **numbers**: every token matching `/\d[\d,.]*\s*(%|k|x|\+)?/` in the rewrite must appear in the
  source (normalized). Missing → `fail:number`.
- **named entities**: capitalized tokens and tool-like tokens `/[A-Z][A-Za-z0-9+#.]*|\b[a-z]+\/[a-z]+\b/`
  in the rewrite must appear in the source or in the candidate lexicon (skills ∪ tools mentioned
  anywhere in the base résumé). Missing → `fail:entity`.
- **scope words**: `led|owned|architected|managed|built` in the rewrite require the same or a stronger
  verb class in the source (`built` may become `developed`; `contributed` may not become `led`) →
  `fail:scope`.
- **length**: 0.6 ≤ len(rewrite)/len(source) ≤ 1.4 → else `fail:length`.
- **counts**: bullet count and order per job unchanged; employer, title, period untouched (they are
  never sent back, so they cannot change).
- optional **entailment** (`light` model, one call per résumé, all bullets batched): "list any claim
  in B not supported by A". Expected false-positive rate is high on paraphrase, so it never rejects;
  it adds `warn:entailment` for the review table. Measure it on a 20-bullet fixture before enabling
  by default.

Summary is verified the same way against the whole base résumé.

### 6.4 Keywords without stuffing

`targetKeywords = extractKeywords(JD) ∩ candidateLexicon`, cap 10 (today all 20 are pushed into the
prompt, `resumeGenerator.js:57-78,112`). Placement budget: ≤ 3 in the summary, skills reorder, and at
most one new keyword per bullet, only where the source bullet already supports it. Post-check: any
keyword appearing more than 3 times in the whole résumé → `warn:density`. B-12's PDF-text check then
confirms the keywords survived rendering.

### 6.5 Review at bulk scale

`tailor-report.md` next to the PDF: a table Source | Tailored | Result (pass / kept-source / warn),
plus the keyword list. `documents.verification` stores the same as JSON, and the dashboard job page
renders it. The digest shows "3 bullets kept as source, 1 warning" per résumé so the user only opens
reports that have warnings. `hunt-job resume <job> --rebuild` re-renders from an edited `resume.json`
(the builder round-trip already exists) without another LLM call.

### 6.6 First slice

Verifier + schema change + `mergeVerified` + report file + `documents` insert (which also closes B-03).
Entailment and the dashboard view come later.

---

## 7. T5 — Training the engineer

### 7.1 Verdict

Build the **minimal stateful loop**, not a learning platform: a topic list derived from the gaps the
scorer already finds, one aggregated study plan across every shortlisted and applied job, a checklist
with self-rating, and an optional five-question quiz. Do not build spaced repetition, week-by-week
plans per application, voice mocks, or YouTube link validation. The per-job guide stays, but it is fed
by the evaluation instead of a bare URL (B-02) and stored in `documents` (B-03).

Why this and not "don't build": with §3, every evaluation yields a structured `missing must-have
skills` list for free. Aggregating those across the funnel is a SQL query, and it answers the question
the user actually has ("what should I study this week to convert these ten applications?") better than
ten separate 4-week plans that nobody follows.

### 7.2 Data model

```sql
CREATE TABLE prep_topics (
  topic_key TEXT PRIMARY KEY,                -- normalized skill/topic, e.g. 'kubernetes', 'system_design'
  label TEXT NOT NULL, category TEXT,        -- 'tool' | 'concept' | 'system_design' | 'behavioral'
  weight REAL NOT NULL DEFAULT 0,            -- recomputed: Σ over source jobs of (score/5) × (1 + interview boost)
  source_job_ids TEXT NOT NULL,              -- JSON array
  source TEXT NOT NULL,                      -- 'gap' | 'must_have' | 'interview_feedback'
  updated_at INTEGER NOT NULL
);
CREATE TABLE prep_progress (
  topic_key TEXT PRIMARY KEY REFERENCES prep_topics(topic_key),
  status TEXT NOT NULL DEFAULT 'todo',       -- todo | practicing | confident
  self_rating INTEGER, last_practiced_at INTEGER, notes TEXT
);
CREATE TABLE prep_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, topic_key TEXT NOT NULL, job_id TEXT,
  kind TEXT NOT NULL,                        -- 'quiz' | 'mock'
  score REAL, at INTEGER NOT NULL
);
```

### 7.3 Loop

- **Derive** (no LLM): after every evaluation, upsert topics from `extraction.must_have_skills` not in
  the candidate lexicon (`source='gap'`) and from must-haves that are present but heavy in the JD
  (`source='must_have'`, refresh), plus `system_design` for staff/lead roles. Weight = Σ (score/5) over
  source jobs in states `shortlisted…interview`; jobs that leave those states drop out on the next
  recompute.
- **Plan**: `hunt-job prep --plan` writes `data/prep/plan.md`, top 10 topics by weight with which jobs
  want them, and the dashboard Prep tab shows the same list as a checklist with the three statuses and
  a 1–3 self-rating.
- **Practice** (optional LLM, `light`): `hunt-job quiz <topic>` asks 5 questions, the user self-grades
  0–2 each, `prep_sessions` stores the total; three sessions ≥ 8/10 suggest `confident`.
- **Per-job guide**: `interviewPrep.generatePrepPlan` receives the job text via `ensureJobRow` and the
  evaluation's mismatches; its focus areas are seeded from the job's topics; file registered in
  `documents`.
- **Outcome hooks** (T7): `interview_at` set → digest shows "interview at X in N days" with that job's
  top 5 topics and current status; `rejected` after `interview` → CLI/dashboard asks one optional line
  "what were you asked?"; each answer becomes an `interview_feedback` topic with a 2× boost, the one
  signal that comes from the actual interview rather than the JD.

### 7.4 First slice

`prep_topics` derivation from existing `evaluations.mismatches` (today's rows) and future
extractions, `prep --plan`, dashboard checklist. Quiz and outcome hooks come after T7.

---

## 8. Assumptions to confirm (single list)

1. The owner will restructure the four prose dealbreakers into the `rules:` block (§1.2); the prose
   stays for the prompt.
2. Profile salary 40–70 LPA is real; it is flagged in the digest header until confirmed.
3. Free-tier caps are unknown; `budget.daily` defaults (150/25/25/30) are placeholders tuned from the
   `llm_calls` ledger after one week.
4. Workday job URL prefix (`/en-US`) and Oracle HCM job URL pattern need per-tenant verification in
   audit; India share of Workday `total` counts is unmeasured.
5. Gmail 2-Step Verification is on so an app password can be issued; `imapflow` is an acceptable
   dependency.
6. `RETURNING` in SQLite via better-sqlite3 12 (bundled SQLite ≥ 3.45) — verify with
   `db.pragma('sqlite_version')`.
7. Entailment check false-positive rate is unmeasured; it ships as a warning, never a rejection.
8. `sprinklr.wd1/intern_newgrad` is the wrong site for experienced roles; a second site exists.
9. The dashboard can gain three tabs (Today, Inbox, Prep) without leaving the single-file design.
