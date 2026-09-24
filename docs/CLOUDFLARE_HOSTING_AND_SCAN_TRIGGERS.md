# Cloudflare hosting and scan triggers — implementation plan

Status: **proposal only** (2026-09-24). This document covers hosting and job discovery/evaluation. Playwright migration, browser-based auto-fill, resume PDF rendering, and unattended application submission are explicitly deferred to a separate design discussion. Nothing here implies the current Node.js app is already compatible with Workers or deployed.

## Goals and non-goals

Run Hunt-Job without EC2 or a continuously running laptop; provide a private HTTPS dashboard; support manual, scheduled, and event-triggered job scans; persist jobs, deduplication, evaluation outcomes and task state; enforce quotas, monitoring and safe retries. Preserve current job-scanning behavior and AI-provider fallback where feasible. No automatic job application or browser automation in phase one. Keep the existing local version usable throughout migration.

## Current repository baseline (main)

- Node.js CLI `hunt-job.js`; `node hunt-job.js run --once --dry-run` is the local pipeline smoke test; `npm run dashboard` starts the local dashboard (`src/web/server.js`).
- Existing scanners, SQLite (`better-sqlite3`), local filesystem, durable queue and `src/core/aiClient.js` are Node-oriented. The AI client supports `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, and `OPENROUTER_API_KEY`; one provider is enough to begin.
- The existing Windows gig-scan scheduled task is not a Cloudflare scheduler and does not deploy the full-time scan pipeline.
- Inspect the exact current schema, scan entry points, settings, provider rate limits, and test suite before implementing adapters. Do not assume every scanner works inside Workers unchanged.

## Proposed architecture

```text
Authenticated browser
       |
Cloudflare Access (private dashboard)
       |
Worker HTTP API + dashboard (on-demand scan endpoint, status, results)
       |                 |
       |                 +--> D1 (jobs, companies, run records, dedup, evaluation, queue metadata)
       |                 +--> R2 (optional exported reports and future resume files)
       |
Cron Trigger ----> scan dispatcher ----> Cloudflare Queue ----> scan/evaluation consumers
       ^                  ^                         |
       |                  |                         +--> Public ATS endpoints + configured AI APIs
Manual dashboard ---------+                         +--> D1 upserts and run metrics
GitHub Actions -> tests/build -> Wrangler deploy
```

Use **D1** instead of `better-sqlite3` in Workers. D1 is not a drop-in replacement: audit SQL syntax, transactions, migrations and concurrency. Use Queues for distributed background tasks; enforce idempotency in D1, not just in-memory. R2 is optional for phase-one scans. Use environment bindings for D1, Queue and R2 rather than generating separate service API keys for each binding. Evaluate Cloudflare Workflows only if orchestration requirements exceed the simpler Queue-based approach.

## Three ways to start a scan

| Mode | Trigger | Intended behavior |
|---|---|---|
| On demand | Authenticated dashboard button or authenticated `POST /api/scans` | Enqueue a scan, immediately return `202` with `runId`; poll status. Never perform an entire scan synchronously in the request. |
| Scheduled | Worker Cron Trigger | Dispatch the same scan command with a schedule-specific idempotency key. Start at every 6 hours, then adjust after observing quotas and useful new listings. Cron is configured in UTC; document displayed IST equivalents. |
| Event-triggered | Authenticated webhook, explicit user action, or another approved internal event | Validate identity/signature, normalize request, dedupe and enqueue. An external ATS webhook is **not assumed**; most public job boards require polling. |

Use one shared dispatcher for all three modes. Proposed request schema: `{ archetype, locationScope, sources, dryRun, trigger }`. Restrict archetypes/sources to an allowlist and validate all inputs. `POST /api/scans` requires authorization and per-user rate limiting. Record trigger source, requested scope, timestamps and status. A manual run should not bypass source rate limits.

### Schedule and throttling

- **Initial default:** four runs per day (every six hours); configurable per archetype/source. Start with India and explicitly selected remote-eligible roles; do not accidentally broaden geography.
- Check source-specific freshness, HTTP caching and minimum polling intervals; do not fetch every company on every run. The existing aggregator fetch interval may differ from direct ATS polling.
- Enforce one active run per overlapping scope, queue task deduplication and bounded retries with exponential backoff and dead-letter handling. Store durable job identity, content hash, first/last seen, and soft-close stale jobs only after a defensible observation window.
- Set daily AI-call and spending budgets; prefilter before AI evaluation; cache unchanged JDs. If a provider hits quota, defer tasks rather than creating an unbounded retry storm.
- Avoid exact cron expression until the desired IST scan times are confirmed; Workers Cron Triggers use UTC.

## Phase-one migration plan

1. **Audit:** inventory Node-only modules, `better-sqlite3` usage, local filesystem dependencies, scanner HTTP clients, test coverage and current dashboard endpoints. Establish baseline local scan results.
2. **Data layer:** define D1 schema and migration scripts for companies, jobs, scan runs, evaluations, deduplication and task state. Design an export/import from local SQLite with backup, validation, and row-count/hash reconciliation; never upload a live database blindly.
3. **Worker service:** build a minimal authenticated health endpoint, scan-dispatch endpoint and status endpoint. Protect dashboard with Cloudflare Access; verify service-token access separately if CI or trusted automation invokes APIs.
4. **Scanner adapters:** port one HTTP-only ATS provider end to end; verify network/runtime compatibility, pagination, rate limiting, data quality and deduplication. Expand providers incrementally, keeping unsupported browser-dependent sources out of phase one.
5. **Queue and AI:** move slow evaluation into Queue consumers, set consumer concurrency and retries, store task status and cost/latency. Port provider SDKs or use fetch-compatible APIs after compatibility testing.
6. **Schedules and dashboard:** configure Cron Triggers; expose manual run/status/results in the private dashboard; add a narrowly scoped signed webhook only when a concrete event source exists.
7. **CI/CD:** GitHub Actions runs install, lint/tests, migration checks and Worker build on PRs. Deploy via Wrangler from protected `main` after review, using scoped GitHub Actions secrets. Run post-deployment smoke checks and provide rollback to a known deployment.
8. **Pilot:** two weeks of monitored scheduled runs before increasing frequency. Keep manual application submission outside this phase.

## Credentials and secrets

- Deployment: `CLOUDFLARE_API_TOKEN` (least-privilege scoped token) and `CLOUDFLARE_ACCOUNT_ID` in GitHub Actions secrets; no global API key. The Cloudflare account connection in a development tool does not automatically provision CI secrets or runtime bindings.
- Runtime: at least one of `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` as encrypted Worker secrets. Configure `AI_PROVIDER` only if intentionally pinning one provider; otherwise preserve the provider-priority/fallback configuration.
- Access: Cloudflare Access application and allowed identity policy; protect every mutating API route. Service-to-service credentials only if needed.
- Bindings: D1 database ID, Queue producer/consumer, and optional R2 bucket declared in Wrangler configuration; resource IDs and names are configuration, not API secrets.
- Optional discovery: Google Programmable Search credentials only if enabling that source; inspect exact environment variable names in the source before provisioning.
- Gmail OAuth, IMAP app passwords and Browser Run credentials/configuration are **out of scope for phase one**. Do not store credentials in the public repository, committed `.env`, logs, D1 records or generated reports.

## Operations and acceptance criteria

Capture each run's `runId`, trigger, status, scanned sources, fetched/new/changed/duplicate counts, shortlisted jobs, API/AI calls, duration, cost estimate and errors. Monitor Queue backlog, failed deliveries, provider quotas, D1 usage and Worker execution limits. Alert on repeated failed schedules and unexpectedly zero new results; zero new jobs alone is not necessarily an incident. Define retention and export/backups for D1 and any R2 data. Add a manual disable switch for Cron dispatch and a way to cancel queued work safely.

Pilot acceptance targets (to validate, not claims about present reliability): at least 95% of scheduled runs complete; zero duplicate queued evaluations for unchanged jobs; no unauthorized scan execution; no lost run state after retries; human-reviewed relevance of at least 80% among shortlisted jobs; reliable manual and scheduled execution of the same dispatcher; documented rollback and data recovery exercise. Compare Cloudflare costs and quotas against observed scan/AI volume before scaling.

## Deferred decisions / separate design

- Playwright and Chromium migration, Cloudflare Browser Run compatibility, resume PDF rendering and ATS auto-fill: **separate discussion/document**.
- Gmail integration and OAuth migration: separate phase after scan deployment.
- Exact schedule in IST, target archetypes, source cadence, webhook producers, notification channel, free-vs-paid Cloudflare plan and D1 backup policy: confirm before implementation.
- No EC2 is proposed for phase one. If a particular scanner requires a browser or unsupported Node API, isolate/defer it rather than silently introducing an always-on VM.

## Reference documentation

- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Queues: https://developers.cloudflare.com/queues/
- D1: https://developers.cloudflare.com/d1/
- Wrangler configuration and secrets: https://developers.cloudflare.com/workers/wrangler/configuration/ and https://developers.cloudflare.com/workers/configuration/secrets/
- GitHub Actions: https://docs.github.com/en/actions
