# 2026-09-19 — brief 13 + backlog closed

All 13 briefs in `docs/fable51-answers.md` §0.3 are built. This session:

- **Brief 13:** `hunt-job calibrate` / `label` (`src/core/scoring/calibrate.js`). Proposal needs ≥15 positives and ≥15 negatives per component and a ≥0.15 gap; nudge ×1.25 bounded to 0.5×–2× of v1; only `--accept` writes a `score_versions` row. Live DB has 0 outcomes, so nothing to propose yet.
- **B-28:** résumé/prep folders named from the job row (`jobDocs.js` `lookupJobMeta`, `makeJobSlug`).
- **B-29:** `aiClient` throws instead of sleeping when every provider cools down for > 60 s (5 min total per process). Before, a daily-quota cooldown meant a 24 h wait.
- **B-30:** Greenhouse custom questions + cover-letter reveal, driven by `applicationAnswers:` in `config/profile.yml`. Not verified on a live form. Invented defaults removed. User must fill `applicationAnswers`.
- **B-13:** builder and CLI renderers cannot share markup (builder is contenteditable). Parity test guards content only.
- Docs synced: `CLAUDE.md` (§9–12), `AGENTS.md`, `README.md`, `BACKLOG.md`, `docs/QUICKSTART.html`.

Open: live Greenhouse check of B-30; `.env` `AI_PROVIDER=gemini` still overrides free provider order.
