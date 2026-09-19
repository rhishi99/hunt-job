# Hunt-Job — open design questions for Fable 5.1

Produced 2026-09-18 by a 5-agent research swarm + Opus review. Every fact below was checked in code or in
the local database by the reviewing session. Things that were answerable are already in `BACKLOG.md`
(ids `B-nn`) — do not re-solve them; you may depend on them.

## 1. How to answer (pass 4)

- **Design, not survey.** For each topic: the state model or algorithm, which files change, the migration
  from today's code, failure modes, and the **smallest first slice** that is useful on its own.
- Cite `path:line`. Flag every assumption. "Don't build this" is a valid answer if you say why.
- Write your answer into the empty `### Fable answer` slot under each topic.

## 2. The app in one paragraph

Hunt-Job is a local Node.js CLI (plus a localhost dashboard) for one engineer in India. It scans public ATS
job APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable, JSON-LD fallback, and two
remote-job aggregators) into SQLite (`data/hunt-job.db`: `companies`, `jobs`, `evaluations`,
`applications`, `documents`, `http_cache`). On request it scores one job with an LLM across 10
dimensions (`src/core/jobEvaluator.js`), generates a tailored one-page résumé PDF with Playwright
(`src/core/resumeGenerator.js`), writes an interview-prep HTML guide (`src/core/interviewPrep.js`), and
opens a real browser that auto-fills the application form but never submits (`src/core/autoFill/`).
Today every step after scanning is triggered by hand, one job at a time. Goal: autonomous search → rate
→ train the engineer → tailor résumé → assisted apply → track outcomes → get the job.

## 3. Hard constraints

- **Money:** no paid models or APIs. LLM calls go to free tiers (Groq, NVIDIA NIM, OpenRouter free
  models, Cerebras; Gemini only via the `agy` CLI). Free tiers have per-minute and per-day caps — exact
  numbers unverified; design for "a few hundred LLM calls a day, may drop to zero for hours". Note:
  `.env` currently forces `AI_PROVIDER=gemini` with a direct key (`src/core/aiClient.js:23-32`); the
  owner chose to leave it — don't redesign around removing it, but don't depend on it either.
- **Hardware:** one Windows 10 Home laptop, not always on. No server, no cloud, no Docker.
- **Human gatekeeper:** Hunt-Job never clicks submit. Everything up to the submit click is fair game.
- **Out of scope:** LinkedIn/Naukri scraping (ToS), the Firebase + Razorpay license plan
  (`temp/PRODUCTIZATION_PLAN.md`), new paid accounts, "switch database / add Docker / TypeScript".
- **Load-bearing decisions — keep:** `jobs` stores every posting globally (soft-close depends on it);
  aggregator rows use `company_id = source`, `employer = hiring company`.

## 4. Measured state (2026-09-18)

- 13,248 active jobs, 240 closed. Last successful scan 2026-09-03; no scheduled task installed.
- 237 companies; **193 have no ATS platform and are never scanned** (`src/core/scan/index.js:58`).
- `evaluations`: 17 rows for 9 distinct URLs. `applications`: 3 rows.

---

## Topics, ranked by impact

### T1. The autonomous loop: a budgeted funnel from 13k postings to a short list with résumé + prep ready

**Question.** Design the single unattended pipeline — scan → cheap pre-filter → LLM evaluation →
(for strong matches) tailored résumé + prep guide → queued for assisted apply — that runs on a laptop
that sleeps, under free-tier LLM caps that can hit zero mid-run.

**Verified context.**
- No path does this today. `src/cli/hunt.js:35` defines `evaluateJobs()` and never calls it, while
  `AGENTS.md:16` claims `hunt` evaluates. `src/cli/watch.js:96-121` only scans and notifies. The
  interactive "full workflow" (`src/cli/flows/scanFlow.js:237-241`, duplicated in `browseFlow.js:102-106`)
  chains evaluate → prep → résumé → apply for one hand-picked job.
- The only pre-LLM filter is title/archetype matching (`src/core/scan/normalize.js:84-98`) plus an India
  location filter. Dealbreakers are advisory text inside the LLM prompt (`jobEvaluator.js:194,207`).
- Each evaluation is one ~2.5k-token prompt with `max_tokens: 2048` (`jobEvaluator.js:249-257`).
  Provider failover is in-process only (`aiClient.js:220-249`); nothing persists work across runs.
- `src/core/logger.js` writes JSONL; there is no job/task table.

**Already decided / not wanted.** No auto-submit. No paid model to "just evaluate everything".

**A good answer includes.** Funnel stages with the signal each uses (e.g. deterministic dealbreakers →
lexical/embedding similarity to the candidate's evidence → LLM) and expected survivors per stage; a
durable work queue (SQLite table? states, retries, idempotency keys) that survives sleep/crash and quota
exhaustion; a daily call budget and how it is split between evaluate / tailor / prep; what the user sees
each morning; how `watch`, `hunt`, `gigs` and the Windows scheduled task collapse into one entry point;
the first slice shippable in a day.

### Fable answer

Answered 2026-09-19 in `docs/fable51-answers.md` §1 (shared spine in §0). Verdict: a durable
`tasks` queue in SQLite drained by a scheduled `hunt-job run --once` every 3 h, not a daemon. The
funnel is ~180 archetype+India postings, not 13k (measured), so 20–60 evaluations a day suffice.
Stages: S0 scan → S1 deterministic rules (new `rules:` block in profile) → S2 lexical evidence score
(no model) → S3 one extraction call + code score → S4 tailor+prep for ≥ threshold → S5 digest. Budget
is a `llm_calls` ledger; quota walls park tasks with `not_before`. `watch`/`hunt`/`gigs` become
aliases of `run`. First slice: queue + `run --once` + existing evaluator + digest.

---

---

### T3. One job identity and a real pipeline state model

**Question.** Define the identity that ties a posting to its evaluation(s), documents and application,
and the state machine the dashboard/CLI move it through.

**Verified context.**
- Two unrelated id spaces: `jobs.id = platform:company:externalId` vs `evaluations.id = job_${Date.now()}`
  (`jobEvaluator.js:268`). `evaluations` has no `job_id`, score or recommendation column — the score lives
  in a JSON blob (`db.js:47-54`). Flows store the **whole JD text** in `evaluations.url` when they pass
  text instead of a URL (`jobEvaluator.js:260` saves `jobInput`).
- `applications` has no `job_id`; all joins are by exact URL string (`src/web/server.js:76,99,102`,
  `flows/applyFlow.js:30`). `url` is indexed, not unique; check-then-insert has no transaction
  (`applyFlow.js:30-35` vs `:142`).
- Dashboard kanban has 6 columns sourced only from `applications` (`dashboard.html:849,856`), but the only
  insert happens at "applied" (`applyFlow.js:142`) — Scanned/Evaluated columns are always empty.
  Status PATCH checks set membership only (`server.js:14,110-117`); one `updated_at`, no per-stage times.
- The CLI "Application Tracker" reads only `evaluations` (`applyFlow.js:156-190`).
- `resume <job-id>` resolves only evaluation ids (`src/cli/generateResume.js:28`).

**Already decided / not wanted.** Keep global `jobs` storage and soft-close. Re-posted jobs may get a
new `jobs.id`.

**A good answer includes.** The key (and what happens on re-post, URL redirect, tracking params);
when an evaluation is reused vs recomputed (JD `content_hash`? profile hash? model?); the states,
legal transitions and who/what moves each one (including automatic moves from T1 and T7); whether
"reapply after rejection" is allowed; schema migration from today's rows (17 evaluations, 3 applications
— small enough to hand-migrate?); how the kanban reads without writing 13k application rows.

### Fable answer

Answered in `docs/fable51-answers.md` §2 (schema in §0.1). Verdict: `jobs.id` is the only identity;
pasted text and foreign URLs become `manual:` job rows via `ensureJobRow` + `canonicalUrl`
(tracking params stripped). New `pipeline` table (one row per funnel job) + append-only
`pipeline_events`; 17 states with a transition table in code, actors scan/pipeline/user/inbox.
Re-posts get `repost_of`, never merged; evaluation reused on (job_id, content_hash, profile_hash,
score_version). Re-apply allowed after rejected/expired with a 90-day gate or a new id. Migration
script for the 17 evaluations + 3 applications (one InMobi duplicate deleted). Kanban reads
`pipeline`, never `jobs`.

---

---

### T2. A score that measures the right thing — and learns from outcomes

**Question.** Redesign the evaluation so the number is grounded, reproducible across free models, and
improves as application outcomes arrive.

**Verified context.**
- `overallScore` is whatever the model says (`jobEvaluator.js:212`); it is not computed from the 10
  dimensions. A dealbreaker scored 1/5 cannot veto. Several dimensions (culture, team, WLB, product-market
  fit) are rarely observable in a JD and have no "unknown" option.
- The prompt never sees the candidate's actual experience or projects — only archetypes, tech stack,
  salary, remote preference, dealbreakers, years (`jobEvaluator.js:184-195`), though the full résumé
  exists in `src/core/resumeData.js`.
- Salary: profile says 40–70 LPA (an unconfirmed assumption), conversion of USD/LPA is left to the model
  (`jobEvaluator.js:209`); most Indian postings state no salary.
- No temperature is passed (`aiClient.js`), and failover silently switches model family
  (Claude/Llama/Gemini) mid-batch, so the same JD can score differently. (Temperature + threshold wiring
  are backlog B-23.)
- Nothing reads `applications.status` back; `applications.evaluation_score` is never written (`db.js:70`).

**Already decided / not wanted.** No fine-tuning, no paid calibration runs. Threshold 4.0 is the current
product rule but is not sacred.

**A good answer includes.** Which dimensions are extracted facts vs judgments; a deterministic
aggregation with hard vetoes and explicit handling of "not stated"; how to make scores comparable across
2–4 free model families (anchor examples? pairwise ranking instead of absolute scores? store model with
score?); an outcome-learning mechanism that works with ~10–50 outcomes a month (not ML at scale) and
cannot silently drift; what to put in the prompt from the résumé without blowing the token budget.

### Fable answer

Answered in `docs/fable51-answers.md` §3. Verdict: split into LLM **extraction** (facts with evidence
quotes, validated as substrings of the JD, temperature 0, JSON mode, no résumé in the prompt) and
**deterministic scoring** in code: hard vetoes from the `rules:` block, six weighted components
(skill 0.40, seniority 0.15, location 0.20, salary 0.10, role scope 0.10, freshness 0.05), unknowns
excluded from the denominator and reported as `coverage`. Culture/team/WLB/PMF stop being numbers.
Cross-model comparability via extraction fixtures + `hunt-job eval-models`; model stored per row.
Learning = monthly `hunt-job calibrate` report proposing bounded weight nudges, applied only on
explicit accept as a new `score_versions` row; rows re-scored from stored extraction, no LLM.

---

---

### T6. Coverage: activating the 81% of the company registry that is never scanned

**Question.** 193 of 237 seeded companies (many large India employers) have no `ats_platform`/`slug`.
How should they become scannable without HTML scraping?

**Verified context.**
- `scanAll` skips rows without platform (`scan/index.js:53-60`). `detect.js:48-71` can find a platform
  marker in HTML but returns `token: null`, and `auditPortals.js:45` rejects any result without a slug —
  including `jsonld`, which needs none. `detect.js` does not look for JSON-LD `JobPosting`.
- JSON-LD provider exists (`providers/jsonld.js`) but reads one page; big employers (Workday, iCIMS,
  Oracle, custom portals) list jobs behind search pages, often client-rendered.
- Workday has an auto-fill adapter (`autoFill/adapters/workdayAdapter.js`) but no scan provider.

**Already decided / not wanted.** No LinkedIn/Naukri. Playwright is installed and acceptable if bounded.

**A good answer includes.** A per-company detection → provider ladder (which ATS families have public
JSON endpoints worth a provider, e.g. Workday's public CXS JSON — verify), what to do with pure custom
portals (sitemap? JSON-LD per job page? drop?), how to verify a slug automatically, the cost of each rung
per scan, and a ranked shortlist of which provider to add first by expected India jobs gained.

### Fable answer

Answered in `docs/fable51-answers.md` §4, backed by a live sweep of all 193 companies on 2026-09-19
(`scratch/sweep.mjs` → `scratch/sweep.jsonl`, gitignored). Verdict: ~40 companies already have public
boards on Greenhouse/Lever/Ashby/SmartRecruiters (registry rows, zero code — but slug guesses need a
name check: Greenhouse `tcs` is "Thornbury Community Services"); ~27 Workday tenants found with host
and site via `robots.txt` (public CXS JSON verified: list POST + detail GET); Oracle HCM (7 companies,
list JSON carries the description); SuccessFactors (5, HTML list + JSON-LD job pages, verified);
Amazon `search.json` (verified, unofficial). Detection ladder: URL regex → slug guess + name verify →
landing markers → Workday robots + site guesses → bounded Playwright network sniff → unscannable.
Google/Apple/Uber/Microsoft/Eightfold endpoints failed from curl: dropped. Build order: registry rows,
then `workday.js` (with lazy `hydrate` tasks), then `oraclehcm.js`, `successfactors.js`, `amazon.js`.

---

---

### T7. Capturing outcomes without the user typing them

**Question.** After an application, how does Hunt-Job learn "received / rejected / interview scheduled /
offer" automatically?

**Verified context.** Zero email/calendar/webhook code in `src/`. Status changes only by manual prompt
(`applyFlow.js:113-118`) or dashboard drag (`server.js:152-159`). `platformDetector.js:7-17` knows 9 ATS
URL patterns. Public ATS APIs used for scanning are anonymous job lists, not candidate status.

**Already decided / not wanted.** Local-only; no third-party SaaS that stores the user's mail. Free.

**A good answer includes.** Which signal source is realistic (Gmail API / IMAP on the user's own
account, calendar invites, ATS candidate portals) and its auth story on a local CLI; how an email is
matched to an application (sender domain, ATS name, job title) and what happens on ambiguity; privacy
(what is stored); how outcomes feed T3's state machine and T2's learning; the smallest first slice.

### Fable answer

Answered in `docs/fable51-answers.md` §5. Verdict: IMAP on the user's own Gmail with an app password
(`imapflow`, MIT), polled inside `run --once`; headers first, body snippet only for candidates,
optional `hunt-job` Gmail label to narrow the search. Rules on ATS mailer domains + subject regexes
classify acknowledged/rejected/interview/offer; `light` LLM only when a company matches but the
outcome is unclear. Match to `pipeline` rows in applied…interview within 120 days by company and
title tokens; unique best → automatic `transition(actor='inbox')`, ties or backwards moves →
`needs_review` (digest + dashboard Inbox tab). `text/calendar` parts → `interview_at`. Storage:
`inbox_events` with message id, domain, subject, outcome, ≤300-char snippet; no bodies. First slice:
connect + header rules + match + review list, no LLM, no calendar.

---

---

### T4. Tailoring that is provably truthful and still ATS-effective

**Question.** How can an LLM rewrite résumé bullets toward a JD while guaranteeing no invented numbers,
scope or technologies — and without keyword stuffing?

**Verified context.** `generateTailored` asks the model not to invent (`resumeGenerator.js:123-128`), but
`mergeTailored` accepts any bullets for a matched role (`resumeData.js:217-218`). Skill-list intersection
is backlog B-07. `extractKeywords` pulls 20 JD keywords and the prompt foregrounds all of them
(`resumeGenerator.js:57-78,112-128`); no density or readability control.

**Already decided / not wanted.** One-page PDF; canonical résumé shape in `resumeData.js`.

**A good answer includes.** A verification method for bullets (claim/number extraction and diff against
the source bullet? constrained rewrite from approved fragments? an entailment check by a second free
model?) with its false-positive rate trade-off; how many JD keywords to target and where; how the user
reviews diffs cheaply when T1 generates résumés in bulk.

### Fable answer

Answered in `docs/fable51-answers.md` §6. Verdict: the model rewrites one bullet at a time and must
return `source_index`; a pure verifier accepts a bullet only if every number, named tool/entity and
scope verb already exists in the source bullet or the candidate lexicon, length within 0.6–1.4×,
counts unchanged; failures keep the source verbatim. `mergeTailored` becomes `mergeVerified`; skills
become an ordering of base skills (B-07). A second-model entailment check is a warning only until its
false-positive rate is measured. Keywords: JD keywords ∩ candidate lexicon, cap 10, ≤ 3 in summary,
≤ 1 new per bullet, density warning above 3 uses. Review: `tailor-report.md` (Source | Tailored |
Result) beside the PDF, stored in `documents.verification`; the digest counts warnings so bulk output
needs opening only when flagged.

---

---

### T5. Training the engineer: from a one-shot guide to an adaptive loop

**Question.** Should interview prep become stateful (weak areas, practice results, progress per
application), and if so what is the minimal loop a single user will actually keep using?

**Verified context.** `interviewPrep.js:100-116` takes the JD + three profile fields and writes a static
HTML file; it ignores the evaluator's `mismatches` for the same job; nothing is stored in SQLite; the
guide is not linked in `documents` (backlog B-03). The dashboard (`src/web/server.js`) is the only UI
that could hold interactive state.

**Already decided / not wanted.** No paid courses/platforms. YouTube links are the current resource type.

**A good answer includes.** The data model (topics, evidence of mastery, source jobs), where practice
happens (dashboard checklist, CLI quiz, mock-interview via free LLM), how weak areas across *all* target
jobs are aggregated into one study plan, how interview outcomes (T7) update it — or a reasoned "don't
build".

### Fable answer

Answered in `docs/fable51-answers.md` §7. Verdict: build the minimal stateful loop, not a learning
platform. Topics are derived without an LLM from the scorer's structured gaps (missing must-have
skills, heavy must-haves, system design for staff roles), weighted by job score across every
shortlisted…interview job, into one ranked plan (`hunt-job prep --plan`, dashboard checklist with
todo/practicing/confident + self-rating). Optional `hunt-job quiz <topic>` (5 questions, self-graded).
T7 hooks: an interview date surfaces that job's top topics; a rejection after interview asks one line
"what were you asked?" which becomes a boosted topic. The per-job guide stays but is fed by the
evaluation (B-02) and stored in `documents` (B-03). Not built: spaced repetition, per-application week
plans, voice mocks, YouTube link validation.

---
