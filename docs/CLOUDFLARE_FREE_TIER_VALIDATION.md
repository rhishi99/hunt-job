# Cloudflare free-tier validation for Hunt-Job

Verified against Cloudflare's official public documentation on **2026-09-24**. This is a companion to [Cloudflare hosting and scan triggers](CLOUDFLARE_HOSTING_AND_SCAN_TRIGGERS.md) in the same pull request. It sets the initial deployment requirement: **Cloudflare hosting cost must remain $0, without enabling a paid Workers plan**. It does not claim access to, or verification of, the user's particular Cloudflare account or its payment-method settings.

## Decision: D1 on Workers Free, conditional on account-level smoke test

Cloudflare explicitly lists **D1 on Workers Free**: 5 GB total storage, 5 million rows read/day and 100,000 rows written/day. The official D1 product page states **'Start building for free — no credit card required.'** A payment method is documented as necessary for purchasing paid products, not as a blanket requirement for D1 Free. Therefore, **D1 is a reasonable zero-cost target**; do not upgrade or enter payment details merely because a third-party setup guide says D1 is paid. However, the public docs cannot establish whether the user's existing account has an account-specific verification or billing prompt. Verify directly in that account before migrating data.

Sources:
- https://developers.cloudflare.com/workers/platform/pricing/ (updated August 28, 2026)
- https://developers.cloudflare.com/d1/reference/faq/
- https://www.cloudflare.com/products/d1/
- https://developers.cloudflare.com/billing/get-started/create-billing-profile/

### Required no-card acceptance test (before implementation commitment)

1. Sign in to the intended Cloudflare account and confirm **Workers Free** is active; do not activate Workers Paid.
2. From the dashboard or Wrangler, attempt to create a **test D1 database** using the free plan. If a payment-method prompt appears, stop, record its exact wording and product, and investigate account-specific restrictions; do not assume a card is necessary or proceed with paid activation.
3. Deploy a minimal Worker bound to the test D1 database; create a table, insert one synthetic row and read it back. Confirm the account still shows the Free plan and no new subscription or payment requirement.
4. Confirm a scheduled trigger and one authenticated manual invocation work within the account's available limits. Remove the test database afterward if not reused.
5. Only after this succeeds, proceed with a backed-up SQLite-to-D1 migration and a one-provider scanner proof of concept.

## Free-tier resource constraints and architecture changes

| Service | Published Workers Free allowance | Hunt-Job design implication |
|---|---|---|
| D1 | 5 GB total storage, 5 million rows read/day, 100,000 rows written/day | Index queries; retain bounded history; track rows read/written. D1 is not a drop-in replacement for `better-sqlite3`. |
| Workers | 100,000 requests/day and **10 ms CPU per invocation** | Split Node.js scanner/evaluation work into small async tasks; test CPU usage, Node API compatibility and source timeouts. Waiting on external HTTP calls is distinct from CPU execution. |
| Queues | 10,000 standard operations/day, 24-hour message retention | Queue small tasks with idempotency and bounded retries; verify account access and quota before depending on Queues. |
| Cron Triggers | Verify current per-account limit in dashboard before configuring | Start with one six-hour schedule; all cron expressions use UTC. |

Sources: https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/queues/platform/pricing/ ; https://developers.cloudflare.com/workers/configuration/cron-triggers/ .

D1 Free limits are **hard limits**, not automatic overage billing: after reaching daily read/write quotas, queries fail until the reset at **00:00 UTC**. Storage exhaustion also blocks additional storage. Monitor and stop or defer scans before hitting quotas. Source: https://developers.cloudflare.com/d1/reference/faq/ .

## Revised implementation gates for the hosting plan

- **Gate A — account and billing:** No-card D1 create/read/write smoke test succeeds in the actual account, Workers Free confirmed, no paid service enabled. If not, pause D1 migration and compare other truly no-card databases before changing architecture.
- **Gate B — runtime:** A single public ATS HTTP scanner, database upsert and AI evaluation complete under actual Workers Free CPU/runtime limits. If they cannot, keep that workload local or redesign into smaller tasks; do not assume moving to a paid plan is authorized.
- **Gate C — triggers:** Authenticated `POST /api/scans`, Cron Trigger and Queue consumer share one dispatcher with idempotency, rate limits and recorded run status. Queue Free limits must be checked under observed volume.
- **Gate D — spend protection:** No paid Cloudflare subscription, paid Browser Run, paid R2, paid analytics or surprise fallback infrastructure. AI-provider API usage is a **separate potential cost**; use a free quota or hard budget where available.
- **Gate E — migration:** Export local SQLite safely, validate row counts and integrity in D1, retain rollback copy and verify recovery.

**Scope:** Hosting, database and scans only. Playwright/browser automation and Gmail remain deferred. This appendix updates the earlier plan's unresolved 'free-vs-paid' decision to **Free-only with a mandatory account-level verification**, not a claim that deployment is already complete.
