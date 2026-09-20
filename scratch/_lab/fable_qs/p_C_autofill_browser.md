# Slice C — Auto-Fill Engine, Browser Automation & Form Safety

Read `scratch/_lab/fable_qs/_brief.md` first and follow it exactly.
Print your full report to stdout (it is captured to a file). Do not write any file.

## Focus
Can the auto-fill engine ever misfire, hallucinate inputs, or violate the non-negotiable safety invariant: NEVER submit without explicit human confirmation?
- **Zero-Auto-Submit Guarantee:** Where is the architectural boundary that prevents accidental form submission? If an ATS form auto-advances on the last field, or submits on an `Enter` keypress during typing, how does the browser automation prevent premature submission?
- **Adapter Selectors vs Custom ATS Layouts:** In `adapters/greenhouseAdapter.js`, `leverAdapter.js`, `smartRecruitersAdapter.js`, and `workdayAdapter.js`, how resilient are CSS/XPath selectors against custom tenant themes, shadow DOMs, or iframe nesting? What percentage of fields fail silently?
- **Generic Heuristic Fallback Failure Modes:** When `platformDetector.js` falls back to `genericAdapter.js`, how are ambiguous fields disambiguated (e.g., "Current CTC" vs "Expected CTC", "Notice Period" vs "Earliest Start Date", "Total YOE" vs "Relevant YOE")? What happens when a required field cannot be matched to `profile.json`?
- **Resume File Upload Reliability:** How does `autoFillBrowser.js` handle resume file attachments (`input[type="file"]`) across different platforms? What happens when an ATS requires a separate cover letter upload, portfolio link, or LinkedIn profile URL?
- **Anti-Bot Challenges & CAPTCHAs:** How does the Chromium automation handle Cloudflare Turnstile, reCAPTCHA, or bot-detection barriers? Does the runner detect blocking states and yield cleanly to the human user, or hang until timeout?
- **Harness vs Reality:** What do `huntjob_e2e_test_standalone.mjs` and `scripts/e2e-test.js` actually validate? Are tests executed against static mock fixtures or live external ATS forms?

## Files
- `src/core/autoFill/index.js`, `src/core/autoFill/platformDetector.js`, `src/core/autoFill/profileMapper.js`
- `src/core/autoFill/adapters/genericAdapter.js`, `src/core/autoFill/adapters/greenhouseAdapter.js`, `src/core/autoFill/adapters/leverAdapter.js`, `src/core/autoFill/adapters/smartRecruitersAdapter.js`, `src/core/autoFill/adapters/workdayAdapter.js`
- `src/core/autoFillBrowser.js`, `src/cli/applyJob.js`, `src/cli/flows/applyFlow.js`
- `huntjob_e2e_test_standalone.mjs`, `scripts/e2e-test.js`, `BROWSER_HARNESS.md`
