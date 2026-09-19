# 2026-09-18 — Fable question swarm

**Verdict:** 52 questions from 5 researchers → 27 verified fixes in `BACKLOG.md` (B-01..B-27, 4 flagged ⚠
silent-wrong-output) + 7 design topics in `docs/fable51-open-questions.md` (T1 autonomous budgeted
funnel, T3 job identity/state machine, T2 grounded + learning score, T6 registry coverage, T7 outcome
connectors, T4 truthful tailoring, T5 adaptive prep). Nothing implemented, nothing committed.

## Facts measured (read-only DB + code)
- Last successful scan 2026-09-03; no hunt/gig scheduled task installed.
- 193 of 237 companies have no `ats_platform` → never scanned.
- 13,248 active jobs; `evaluations` 17 rows / 9 URLs (duplicate scoring); `applications` 3.
- Most severe latent bug: unparseable ATS response → all of that company's jobs closed and company
  marked healthy (`scan/httpClient.js:116-124` → `scan/index.js:206-217`). Not yet seen in logs.
- Evaluator never sees the candidate's experience; `overallScore` is the model's own number.
- Résumé/prep are generated from a bare URL (`cli/generateResume.js:34`); auto-fill uploads newest PDF
  from `data/resumes/`, which nothing writes.

## Tooling lessons
- Claude Code background Bash tasks here get cut off when the turn ends → `agy` stdout redirect lost
  (empty reports). Launch agy via PowerShell `Start-Process` + have agy write its own report file;
  watch with the Monitor tool.
- agy `claude-sonnet-4-6` hit 429 RESOURCE_EXHAUSTED; `gemini-3.8-flash-high` worked for all 3 slices.
- Grok not signed in (`grok login --device-code` needed).

## Where raw material lives
`data/_lab/fable_qs/` (gitignored): `_brief.md`, `p_*.md` slice prompts, `r_*.md` reports,
`pass3_notes.md` (per-question verdicts).
