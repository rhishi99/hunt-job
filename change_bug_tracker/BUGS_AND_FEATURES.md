# Hunt-Job — Bug & Feature Log

> Originally observed by **Hermes acting as an end-user** of the app. Every entry below has
> since been triaged against the actual source (2026-09-03); the verdict line is the current
> truth. Struck-through original claims are kept one line each only so they are not re-derived.

| ID | Status | Resolution |
|---|---|---|
| BUG-001 | ❌ Invalid | No doc publishes a `jobs` column list; the contradicted doc does not exist |
| BUG-002 | ❌ Invalid | Global storage is deliberate and load-bearing for soft-close |
| BUG-003 | ✅ Fixed | `npm run profile:seed` + completeness guard |
| BUG-004 | ❌ Invalid | By design — `inquirer` needs a TTY; subcommands are the automation path |
| FEAT-001 | ⏭ Skipped | `list --json` already covers it |
| FEAT-002 | ✅ Done | `isProfileComplete()` guard in `profileManager.js` |
| FEAT-003 | ❌ Rejected | Built on invalid BUG-002; would break soft-close |
| FEAT-004 | ⏭ Deferred | Speculative — no consumer needs it yet |

---

## 🐛 Bugs

### BUG-001 — ❌ INVALID (closed 2026-09-03)
**Verdict:** The doc being contradicted does not exist. Grepped `README.md` and `CLAUDE.md`:
neither publishes a `jobs` column list, neither claims a `company` column on `jobs`, neither
claims a `score` column. The only schema-shaped README hits are prose (`line 29`, `line 352`)
describing the DB in general terms, which are accurate. Nothing to fix.

~~Original claim: "Docs describe a `jobs` schema that doesn't exist" — README/CLAUDE.md imply a `company` and `score` column.~~

### BUG-002 — ❌ INVALID as filed (closed 2026-09-03)
**Verdict:** Storing every posting globally is deliberate and load-bearing, not a filter leak.
`src/core/scan/index.js` calls `txn(normalized)` on the **unfiltered** array, per its own
comment: the `jobs` table is a shared cache across archetypes, and soft-close must mean
"still open at the ATS", not "still matches this search".

"Fixing" it would break soft-close: storing only India matches makes the
`UPDATE ... WHERE id NOT IN (seenIds)` sweep mark every non-India posting closed on each scan
and reopen it on the next, churning `status` and making `newJobs` meaningless.

The India filter **does** run at scan time (`index.js`, alongside the archetype filter) to gate
the returned `jobs`/`newJobs`, and again at read time in `query.js#filterJobs`. Working as
designed.

**Real residue (tracked separately, not a bug):** the DB is **176 MB for 12,950 jobs
(~13.6 KB/job)**, nearly all of it `description` blobs on rows that will never match. If that
becomes a problem, the fix is to skip storing `description` on non-matching rows while keeping
`id` + `content_hash` so soft-close still works — not to drop the rows.

~~Original claim: "India-only filter appears not to be enforced at scan time" — evidence was non-India rows in the DB, which is the intended cache behaviour.~~

### BUG-003 — ✅ FIXED (2026-09-03)
**Was real and highest-severity.** `config/profile.yml` was the untouched scaffold
(`name: "Updated Name"`, `archetypes: []`, `techStack: []`, `yearsOfExperience: 0`), so
`jobEvaluator.buildEvaluationPrompt()` interpolated empty fields straight into every LLM call —
every job scored against nothing.

**Root cause:** nothing ever populated `profile.yml`. `npm run profile:init` writes the *empty*
scaffold, so the bug would recur on any re-init.

**Fix:**
- `scripts/seed-profile.js` (+ `npm run profile:seed`) derives the profile from
  `src/core/resumeData.js#defaultResumeData()`, which was already the canonical résumé — no
  second copy of the data. Idempotent; refuses to clobber a complete profile without `--force`.
- ⚠ The seeded `salary` range (40–70 LPA) is an **assumption**. The evaluator scores salary
  alignment against it, so a wrong range silently skews every score. Confirm it.

### BUG-004 — ❌ INVALID / by design (closed 2026-09-03)
**Verdict:** `inquirer` requires a TTY; that is the library working correctly, not a defect.
The non-interactive subcommand path (`list`, `scan`, `evaluate`, all with `--json`) is the
supported automation interface and is already documented in `HERMES_USAGE_GUIDE.md`.

---

## ✨ Feature ideas

### FEAT-001 — ⏭ SKIPPED
`list --json` already returns exactly this. A separate `digest` command would be a second name
for an existing capability.

### FEAT-002 — ✅ DONE (2026-09-03)
`isProfileComplete(profile)` exported from `src/core/profileManager.js` returns
`{ok, missing[]}` over the seven fields the evaluator actually consumes. Called from
`loadProfile()` — the single choke point every consumer (evaluator, resume generator, scan
flows) routes through — including the `HUNT_JOB_*` env path, which was the original ask.
Warning prints once per process to **stderr**, so `--json` output stays parseable.
Covered by `test/profileManager.test.js` (6 tests).

### FEAT-003 — ❌ REJECTED
Built on the invalid BUG-002. Moving the India filter into the upsert path breaks soft-close
(see BUG-002). The 176 MB concern is real but has a different fix, recorded under BUG-002.

### FEAT-004 — ⏭ DEFERRED
No consumer needs it yet. Revisit when something actually branches on exit codes.

---

## Verification note
Triage verdicts above were established by reading `src/core/scan/index.js`,
`src/core/scan/normalize.js`, `src/core/scan/query.js`, `src/core/db.js`,
`src/core/profileManager.js` and grepping the docs — not from the original end-user
observations alone.
