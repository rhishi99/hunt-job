# Slice E — Unattended Watch Daemons, Dashboard & Technical Debt

Read `scratch/_lab/fable_qs/_brief.md` first and follow it exactly.
Print your full report to stdout (it is captured to a file). Do not write any file.

## Focus
Can Hunt-Job run reliably as an unattended background service, and what structural friction blocks tactical morning triage and Phase 5 product expansion?
- **Silent Failures in Background/Daemon Mode:** When executing under `hunt-job.js watch`, PowerShell background jobs (`hunt-job.ps1`), or Windows Task Scheduler (`install-gig-schedule.ps1`), what fails without alerting the user? If a network partition occurs, or an ATS provider hangs without timing out, does the daemon freeze indefinitely?
- **Web Dashboard Scalability Limits:** The web server (`src/web/server.js`) is an unthreaded stdlib HTTP server serving a single-file DOM application (`src/web/dashboard.html`). When the `jobs` table grows to 5,000+ postings, how do `/api/jobs` query latencies, DOM rendering, and Kanban board animations degrade? Is pagination or virtualized scrolling implemented?
- **Business Logic Duplication (CLI vs Web):** How much orchestration is duplicated between the interactive CLI flows (`src/cli/flows/*`, `src/cli/hunt.js`) and the web server API handlers (`src/web/server.js`)? Can changes to scanning or evaluation parameters in one interface drift from the other?
- **Tactical Morning Triage Friction:** The stated product goal is a 10-minute morning triage. What manual friction points exist between reviewing high-scoring postings on the dashboard, launching the auto-fill browser, and inspecting tailored PDF resumes?
- **Phase 5 Expansion Blockers:** In `change_bug_tracker/ROADMAP.json`, Phase 5 plans multi-profile switching, Indian compensation insights, and a daily email digest. How tightly coupled is the codebase to the single singleton `config/profile.json` and local machine assumptions? What would break if multi-user or multi-profile support were introduced?

## Files
- `hunt-job.js`, `hunt-job.ps1`, `src/index.js`
- `src/cli/watch.js`, `src/cli/hunt.js`, `src/cli/listJobs.js`, `src/cli/jobBrowse.js`, `src/cli/ui.js`
- `src/cli/flows/huntFlow.js`, `src/cli/flows/scanFlow.js`, `src/cli/flows/browseFlow.js`, `src/cli/flows/setupFlow.js`
- `src/web/server.js`, `src/web/dashboard.html`
- `scripts/install-gig-schedule.ps1`
- `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`, `change_bug_tracker/ROADMAP.json`
