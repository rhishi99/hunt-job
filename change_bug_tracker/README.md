# Change & Bug Tracker — Hunt-Job

Track project roadmap milestones, known edge cases, bug reports, and architectural evolutions.

## Roadmap Summary

The current milestone breakdown is maintained in [`ROADMAP.json`](./ROADMAP.json).

- **Phase 1: ATS Scanner & SQLite DB Foundation** (Completed)
- **Phase 2: AI Scoring & ATS Resume Synthesis** (Completed)
- **Phase 3: Human-in-the-Loop AutoFill Engine** (Completed)
- **Phase 4: Web Dashboard & E2E Test Harness** (Completed)
- **Phase 5: Future Expansions** (Planned: Multi-profile, compensation analytics)

## Reporting Issues & Verification

Always run test suites before logging changes:

```powershell
npm test
npm run test:e2e
```
