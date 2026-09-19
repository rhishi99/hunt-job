# 2026-09-19 — Fable answers to the 7 design topics (pass 4)

**Verdict:** all seven topics answered in `docs/fable51-answers.md` (design, schema, build order, first
slices); each `### Fable answer` slot in `docs/fable51-open-questions.md` now holds a short verdict
pointing at the section. Nothing implemented, nothing committed. Next: hand `docs/fable51-answers.md`
§0.3 (13 briefs, dependency-ordered) to the subagent army; briefs 1, 2, 7 can start in parallel.

## Facts measured this session (live DB + live HTTP, 2026-09-19)
- Funnel is small: 13,248 active jobs → 680 archetype-ish titles → **179** also India/remote/empty
  location. LLM stage needs ~20–60 evaluations/day after a ~200 backlog.
- Descriptions: avg 3.1k chars, max 17.7k, 4 empty. `documents` table has 0 rows.
- Registry sweep of all 193 unscanned companies (`scratch/sweep.mjs` → `scratch/sweep.jsonl`,
  gitignored): ~40 have public Greenhouse/Lever/Ashby/SmartRecruiters boards (registry rows only);
  27 Workday tenants resolved via `robots.txt` Sitemap line; Oracle HCM ×7, SuccessFactors ×5, Amazon.
- Verified public JSON: Workday CXS list `POST /wday/cxs/{tenant}/{site}/jobs` + detail GET; Oracle
  HCM `recruitingCEJobRequisitions` (description fields in the list); Amazon `search.json`.
  Failed/blocked from curl: Google, Apple, Uber, Microsoft, Eightfold, Phenom (client-rendered).
- Slug guessing without a name check is wrong: Greenhouse `tcs`="Thornbury Community Services",
  `linkedin`="LI Test Company", `bcg`="Bohen Consulting Group". Greenhouse `/v1/boards/{slug}.name`
  and SmartRecruiters `postings[].company.name` give the check.
- Workday robots lists one site per tenant and misses some live tenants (redhat, zoom): follow with
  site-name guesses.

## Design decisions (details in docs/fable51-answers.md)
- `jobs.id` is the single identity; pasted text/foreign URLs become `manual:` job rows.
- New tables: `pipeline`, `pipeline_events`, `tasks` (durable queue, UNIQUE idempotency key, claim
  via `UPDATE … RETURNING`), `llm_calls` (budget ledger), `score_versions`, `inbox_events`, `prep_*`.
- One entry point `hunt-job run --once` on a 3-hourly Scheduled Task; `watch`/`hunt`/`gigs` → aliases.
- Score = LLM extraction with evidence quotes (validated against JD) + deterministic weighted code
  score with vetoes and `coverage`; weights versioned, changed only via `calibrate --accept`.
- Outcomes via IMAP app password (`imapflow`), headers-first, rules-first, `needs_review` fallback.
- Tailoring: per-bullet `source_index` + pure verifier (numbers/entities/scope/length); fail → source.
- Prep: topics derived from extraction gaps, one aggregated plan, checklist + optional quiz; no LMS.

## Tooling lessons
- Bash hook rejects `cat >` heredocs: use the Write tool for scripts, then run from inside the repo
  (`scratch/`), otherwise `node` cannot resolve `better-sqlite3` from the scratchpad path.
- `myworkdayjobs.com` root returns 406 without an `Accept: text/html` header; `robots.txt` needs none.
- A curl loop over ~100 tenants × 8 hosts exceeds the 10-min foreground limit; the run was auto
  backgrounded and completed — fine, but start such sweeps with `run_in_background` and stream to a file.
