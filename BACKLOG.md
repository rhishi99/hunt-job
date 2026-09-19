# Hunt-Job Backlog

## TO-DO from the 2026-09-18 research swarm

Answered-but-not-built items. Each was verified in code by the reviewing session (pass 3); raw reports in
`data/_lab/fable_qs/` (gitignored). Open design questions went to `docs/fable51-open-questions.md` instead.
⚠ = latent data loss or wrong output that the user would not notice.

| id | task | evidence / fix | source | status |
|---|---|---|---|---|
| B-01 ⚠ | One bad HTTP body closes every job of a company and marks it healthy | `scan/httpClient.js:116-124` returns `null` on unparseable body → provider `parse` returns `[]` (`providers/greenhouse.js:8`) → `scan/index.js:206-208` `closeAllForCompany` + `:217` `markCompanyOk`. Fix: `fetchJson` throws on non-empty unparseable body; and treat "0 jobs where there were >N active" as a failure until seen twice. Not yet observed in logs. | A#Q2 | done |
| B-02 ⚠ | Résumé + interview prep are generated from a bare URL string (model invents the JD) | `cli/generateResume.js:34` passes `job.url`; `flows/resumeFlow.js`, `cli/prepareInterview.js`, `flows/huntFlow.js:74,91` forward raw input. Fix: call the already-exported `resolveJobText` (`jobEvaluator.js:309`) at every entry. | C#Q3 | done |
| B-03 ⚠ | Auto-fill uploads a stale / wrong-job résumé | `autoFill/profileMapper.js:19-31` picks newest PDF in `data/resumes/`, which no generator writes (generator writes `data/<Company>_<Title>_<date>/`). `documents` table (`db.js:75`) has zero writers. Fix: generator + prep insert into `documents`; apply resolves the job's own PDF; no job PDF → warn, don't guess. | C#Q6, D#Q1 | done |
| B-04 ⚠ | LLM JSON parse failure is silent: evaluation saved as score 0 "Weak match", résumé falls back to untailored, prep renders empty | `jobEvaluator.js:222-239`, `resumeGenerator.js:138-145`, `interviewPrep.js:67-91,145-169`. Fix: provider JSON mode in `aiClient.js` + one repair retry, then throw. This is the root cause of launch bug #1 in `temp/PRODUCTIZATION_PLAN.md`. | B#Q8, C#Q10 | done |
| B-05 | Per-host throttle bypassed under concurrency 5 | `scan/httpClient.js:38-43` reads `last` before `await sleep`; parallel callers all see stale time. Fix: reserve slot synchronously (`next = max(now, next) + GAP`). | A#Q5 | done |
| B-06 | Aggregator soft-close churns postings past the 500-row page cap | `providers/himalayas.js:26` MAX_PAGES=25 + `scan/index.js:201-205` NOT-IN sweep. Fix: partial feeds skip the sweep; close when `last_seen_at` older than N days. | A#Q1 | done |
| B-07 | Tailored résumé can list skills the candidate never had | `resumeData.js:202` replaces `skills` wholesale; `test/resumeGenerator.test.js:77-92` asserts it. Fix: intersect with base skills + alias map; keep `skillGroups` consistent. (Bullet-level truthfulness → Fable T4.) | C#Q1 | done |
| B-08 | Archetype matcher: "Engineering Manager" matches only the exact phrase; multi-word archetypes OR-match | `scan/normalize.js:90-97`. Fix: fall back to all tokens when every word is generic; AND semantics for multi-word archetypes. | A#Q9 | done |
| B-09 | Quarantined companies never come back unattended | only `cli/auditPortals.js:51` re-enables. Fix: canary re-probe of disabled rows with backoff (1d, 3d, 7d) inside `scanAll`. 0 quarantined today. | A#Q3 | done |
| B-10 | `list`/`browse` load every description blob into memory | `scan/query.js:24-61`. Fix: SQL filters + LIMIT first, fetch `description` only for the page. | A#Q6 | done |
| B-11 | Remotive hardcoded to `devops-sysadmin` | `providers/remotive.js:25`. Fix: map profile archetypes → Remotive categories. | A#Q10 | done |
| B-12 | Generated PDF is never checked for extractable text | reuse `resumeParser.js` after `resumeGenerator.js:51`: assert length, contact info, keyword coverage. | C#Q2 | done |
| B-13 | Two résumé renderers drift (CLI vs builder's 6 templates) | `resumeGenerator.js:206-388` vs `resume-builder/index.html:578-587`. Fix: one shared template module. | C#Q7 | open |
| B-14 | `http_cache` never evicted; caches cursor/offset pages | `db.js:88`, `httpClient.js:54`. Fix: skip caching paginated URLs + TTL purge. Low (225 rows). | A#Q7 | done |
| B-15 | `scan --new` means "new this run", `list --new` means "first seen <48h" | `cli/scanPortals.js:31-35` hardcodes `firstSeenAt: null`. | A#Q8 | done |
| B-16 | No post-fill audit of still-empty required fields | add one shared audit in `autoFill/index.js` after the adapter runs (never touches submit). | D#Q8 | done |
| B-17 | `applications.evaluation_score` / `recommendation` never written | `db.js:70-71`, insert at `flows/applyFlow.js:142`. Fix: snapshot score at apply time. | D#Q9 | done |
| B-18 | Same job scored again on every run | measured: 17 `evaluations` rows for 9 URLs. Stop-gap: reuse latest evaluation for same URL unless `--fresh`. Real key design → Fable T3. | E#Q3 | done |
| B-19 | `hunt` evaluates nothing, though `AGENTS.md:16` says "scan + evaluate" | Fixed: `cli/hunt.js` is now a thin alias for `run --once` (real scan+prefilter+evaluate+digest, `src/cli/run.js`); dead `evaluated-jobs.json` banner removed. Docs (`AGENTS.md`, `README.md`, `CLAUDE.md`) updated to match. | E#Q5 | done |
| B-20 | Pipeline e2e test not in CI; `test:e2e` runs the dashboard smoke test instead | `package.json:17`; `scripts/e2e-test.js` stubs AI (free). Fix: add `test:pipeline` and run it in `.github/workflows/test.yml`. | E#Q6 | done |
| B-21 | "Full workflow" ignores the 4.0 threshold and opens the apply browser for "Skip" jobs | `flows/scanFlow.js:237-241` and `flows/browseFlow.js:102-106` (duplicated). Fix: confirm below `minimumApplyScore`. | E#Q7 | done |
| B-22 | Dead code: second SQLite cache + dead entry class | `core/jobCache.js` (only `scanFlow.js` uses it; `query.js` covers it), `src/index.js` `CareerOpsAgent` (zero references). | E#Q8 | done |
| B-23 | Scores not reproducible; threshold hardcoded | `settings.json` `temperature` / `minimumApplyScore` never read; `aiClient.js` passes no temperature; `>= 4.0` in `evaluateJob.js:33`, `evaluateFlow.js:75`, `huntFlow.js:56`, `applyFlow.js:186`. | B#Q1 | done |
| B-24 | Provider health is sticky for the process; Gemini 429 sleeps 30–90 s before failover | `aiClient.js:230-243` boolean health; `aiClient.js:69-75` sleep. Fix: timed cooldown; fail over first, sleep last. | B#Q4, B#Q11 | done |
| B-25 | `evaluate <url>` re-fetches the page even when `jobs.description` is stored | `jobEvaluator.js:128-164` never reads DB. Fix: DB lookup by `url`/`apply_url` first. | B#Q6 | done |
| B-26 | Dimension keys differ per model → broken bars/comparisons | `jobEvaluator.js:197-213`; canonical keys from `settings.json` `evaluation.dimensions`. | B#Q9 | done |
| B-27 | Scanner has not run since 2026-09-03 | measured `max(companies.last_ok_at)`; no hunt/gig scheduled task installed. Owner call: run `scripts/install-gig-schedule.ps1` or not. | pass 3 | done (installed 2026-09-19, HuntJob-Run every 3h, AI_PROVIDER=groq) |
| B-28 | Résumé folder named `Unknown-Company_...`: generator regex-parses company from JD text instead of using the job row | `resumeGenerator.js:22-23`; pass company/title from `resolveJobInput` | e2e 2026-09-19 | open |
| B-29 | `run` retries a failing provider for the full 30-min task limit (all-cooling-down 60s waits) | `aiClient.js` cooldown loop; cap total wait per run, fail the task instead | e2e 2026-09-19 | open |
| B-30 | Country dropdown, cover letter, custom questions not auto-filled on Greenhouse | shown by B-16 audit; needs adapter work + profile answers (notice period, CTC) | e2e 2026-09-19 | open |
