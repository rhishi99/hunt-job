# Browser-Harness E2E Testing — Hunt-Job

Single reference for the browser-driven end-to-end smoke tests. The runner is `huntjob_e2e_test_standalone.mjs` (Node Playwright) at the repo root.

It is **self-contained**: it launches its own Chromium through Playwright, boots a background test instance of the web server if not already running on `http://127.0.0.1:7777`, tests all core user flows, and shuts down cleanly.

---

## What It Tests

Five core UI flows against a live or self-booted dashboard:

| Test | Flow / Route | Checks |
|------|--------------|--------|
| **1. Topbar & Stats** | `http://127.0.0.1:7777/` | Brand header rendered, KPI metrics loaded from SQLite (Scanned, Evaluated, Applied, Offers) |
| **2. Pipeline Kanban** | `Pipeline tab` (`#view-pipeline`) | Kanban board container mounted, 6 status columns present (`Scanned`, `Evaluated`, `Applied`, `Interview`, `Offer`, `Rejected`) |
| **3. Jobs Table & Filters** | `Jobs tab` (`#view-jobs`) | Real-time table rows populated, search filter applied and cleared, score & freshness dropdowns |
| **4. Evaluations & Profile** | `Evaluations` & `Profile` tabs | 10-dimension evaluation score cards and candidate profile summary render cleanly |
| **5. Detail Modal Interaction** | `#detail-modal` | Job row click opens drawer/modal with exact terminal commands, close button dismisses cleanly |

---

## Running the E2E Suite

### Quick Commands

```powershell
# Via PowerShell workflow manager:
.\hunt-job.ps1 e2e

# Via Node directly:
node huntjob_e2e_test_standalone.mjs

# Via npm script:
npm run test:e2e
```

Results print directly to the console with green checkmarks and write a structured JSON report to `TEST_RESULTS.json` at the repo root.

---

## Configuration

All configuration is at the top of `huntjob_e2e_test_standalone.mjs`:

| Constant | Default | Meaning |
|----------|---------|---------|
| `BASE_URL` | `http://127.0.0.1:7777` | Web dashboard server URL |
| `TIMEOUT` | `15000` | Per-action timeout in milliseconds |
| `headless` | `true` | Set `false` to watch the browser in real-time |

---

## Selector Contract

The runner anchors on semantic DOM selectors:

| Element | Selector |
|---------|----------|
| Brand Header | `.brand` |
| Stats Container | `#stats-row .stat` |
| Navigation Tabs | `a[data-view='pipeline']`, `a[data-view='jobs']`, `a[data-view='evaluations']`, `a[data-view='profile']` |
| Kanban Board | `#kanban-board .column` |
| Jobs Table | `#jobs-table tbody tr` |
| Search Input | `#jobs-search` |
| Detail Modal | `#detail-modal` / `#detail-modal.active` |
| Modal Close Button | `#detail-modal .close-btn` |

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `Port 7777 in use` | The script automatically connects to existing servers on `:7777`. If stale, run `.\hunt-job.ps1 stop` |
| `Playwright error` | Run `npx playwright install chromium` |
| `Table empty in tests` | If database is unseeded, run `node scripts/seed-ats-companies.js` or `npm run seed:ats` |
