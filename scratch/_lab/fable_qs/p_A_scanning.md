# Slice A — ATS Ingestion, Scanner Engine & Portal Health

Read `scratch/_lab/fable_qs/_brief.md` first and follow it exactly.
Print your full report to stdout (it is captured to a file). Do not write any file.

## Focus
What stops ATS scanning from being 100% reliable, zero-loss, and fresh?
- **Transient Failures vs Soft-Closes:** When an ATS API returns 429, 500, or an empty jobs array, does the orchestrator mistakenly mark all previously active jobs for that company as `status = 'closed'`? Where is the guard that prevents a network glitch from closing hundreds of active postings?
- **5-Fail Auto-Disable Invariant:** How does the company registry track `fail_count`? Can a company get permanently disabled because of a transient VPN issue or an expired SSL certificate? How is an auto-disabled company revived?
- **Deduplication & Content-Hashing:** How is `id` constructed across different providers (`{platform}:{company}:{external_id}`)? What happens when a company migrates ATS (e.g., Lever → Ashby) or re-posts the same role under a new requisition ID? Can content-hashing detect stealth updates (e.g., salary/requirements changed, but title remained the same)?
- **Location & Archetype Normalization:** How does `normalize.js` handle Indian cities (Bengaluru vs Bangalore, Gurgaon/Noida vs Delhi NCR) and ambiguous remote tags ("Remote - US Only" vs "Remote - Worldwide" vs "Hybrid, India")? Where can an India-eligible role get falsely dropped, or a US-only role leak into the triage feed?
- **Aggregators vs Direct ATS:** How do aggregator providers (`remotive.js`, `himalayas.js`) interact with the per-company database model where `company_id` is the aggregator source instead of the hiring employer?

## Files
- `src/core/scan/index.js`, `src/core/scan/detect.js`, `src/core/scan/httpClient.js`, `src/core/scan/normalize.js`, `src/core/scan/query.js`
- `src/core/scan/providers/ashby.js`, `src/core/scan/providers/greenhouse.js`, `src/core/scan/providers/lever.js`, `src/core/scan/providers/smartrecruiters.js`, `src/core/scan/providers/recruitee.js`, `src/core/scan/providers/workable.js`, `src/core/scan/providers/jsonld.js`, `src/core/scan/providers/himalayas.js`, `src/core/scan/providers/remotive.js`
- `src/core/portalScanner.js`, `src/cli/scanPortals.js`, `src/cli/auditPortals.js`, `src/cli/gigs.js`
- `config/company-portals.json`, `scripts/seed-ats-companies.js`, `scripts/seed-aggregators.js`
- `test/scan/`
