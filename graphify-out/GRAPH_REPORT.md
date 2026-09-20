# Graph Report - hunt-job  (2026-09-19)

## Corpus Check
- 152 files · ~203,019 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 783 nodes · 1873 edges · 26 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 329 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 65 edges
2. `runMigrations()` - 41 edges
3. `closeDb()` - 28 edges
4. `fetchJson()` - 27 edges
5. `normalizeJob()` - 22 edges
6. `clear()` - 21 edges
7. `banner()` - 21 edges
8. `pressEnter()` - 20 edges
9. `applyToJob()` - 20 edges
10. `cleanHtml()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `freshDb()` --calls--> `runMigrations()`  [INFERRED]
  test\jobEvaluator.test.js → src\core\db.js
- `freshDb()` --calls--> `runMigrations()`  [INFERRED]
  test\pipeline\budget.test.js → src\core\db.js
- `freshDb()` --calls--> `runMigrations()`  [INFERRED]
  test\pipeline\queue.test.js → src\core\db.js
- `freshDb()` --calls--> `runMigrations()`  [INFERRED]
  test\pipeline\runner.test.js → src\core\db.js
- `freshDb()` --calls--> `runMigrations()`  [INFERRED]
  test\scoring\score.test.js → src\core\db.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (48): companiesFromDb(), fetchJobs(), parse(), fetchJobs(), parse(), fetchJobs(), parse(), fetchJobs() (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (44): fmt(), main(), assertLongEnough(), buildDimensions(), classifyJobInput(), computeProfileHash(), extractJsonLdJobPosting(), fetchGenericText() (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (36): loadFixtures(), main(), getProviderStatus(), loadEnv(), main(), saveEnv(), showProviderTable(), testProviderKey() (+28 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (24): freshDb(), freshDb(), insertJob(), queuedJob(), runMigrations(), freshDb(), freshDb(), isLegalTransition() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.19
Nodes (35): main(), main(), mapLimit(), main(), mainMenu(), banner(), clear(), err() (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (28): generateResume(), prepareForInterview(), InterviewPrep, normalizeConceptsToMaster(), toStr(), assertJobText(), findJobByUrl(), findJobDocument() (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (42): bootstrapBudgetHook(), main(), makeEvaluateHandler(), parseArgs(), profileHash(), runAndReport(), runOnce(), syncPipelineAndEnqueue() (+34 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (28): confirmAndEdit(), main(), createClient(), makeJobSlug(), emptyResumeData(), esc(), fromProfile(), intersectSkills() (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (27): archetypesToHunt(), main(), unionById(), parseFilterArgs(), printJobs(), main(), bellAndLog(), main() (+19 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (25): parseArgs(), runInboxCli(), classify(), companyTokens(), domainMatches(), domainOf(), icsDate(), isAtsMailer() (+17 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (29): auditCompany(), main(), runScript(), buildQueries(), canonicalLinkedInUrl(), decodeEntities(), fetchJobs(), hasGoogleCreds() (+21 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (24): aiMapFields(), extractFormSnapshot(), runGenericAdapter(), tryFill(), uploadResume(), fillCustomQuestions(), fillOne(), labelOf() (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (16): isProfileComplete(), loadEnvProfile(), ProfileManager, defaultResumeData(), buildDigest(), evaluatedMaybe(), fmtDateTime(), health() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (22): flagVal(), runPrep(), generateQuestions(), runQuiz(), deriveTopics(), listTopics(), parseFacts(), recordSession() (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.31
Nodes (18): cCyan(), cGray(), cGreen(), cRed(), cWhite(), cYellow(), Get-DbStats(), Get-PortPID() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (12): allEntries(), applyPlan(), buildPlan(), findByName(), main(), nameMatches(), planEntry(), printPlan() (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.26
Nodes (10): applicationRowFromJson(), backup(), companyRowFromPortal(), companyRowFromScannable(), evaluationRowFromJson(), importApplications(), importEvaluations(), main() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (8): clickNext(), fillByLabel(), fillStep1(), fillStep2(), fillStep3(), runWorkdayAdapter(), tryUploadResume(), waitForFormReady()

### Community 18 - "Community 18"
Cohesion: 0.46
Nodes (7): isServerRunning(), runAllTests(), testEvaluationsAndProfile(), testJobsTableAndSearch(), testModalInteractions(), testPipelineKanban(), testTopbarAndStats()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (2): expect(), expectNormalizedShape()

### Community 20 - "Community 20"
Cohesion: 0.6
Nodes (5): fireReactChange(), runLeverAdapter(), tryFill(), tryFillTextarea(), uploadResume()

### Community 21 - "Community 21"
Cohesion: 0.6
Nodes (5): fillByLabel(), runSmartRecruitersAdapter(), tryFill(), trySelect(), uploadResume()

### Community 22 - "Community 22"
Cohesion: 0.83
Nodes (3): get(), probe(), variants()

### Community 23 - "Community 23"
Cohesion: 0.83
Nodes (3): main(), parseArgs(), runScript()

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (2): editProfile(), section()

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (2): freshAiClient(), setProviderEnv()

## Knowledge Gaps
- **Thin community `Community 19`** (6 nodes): `cleanup()`, `ensureDirs()`, `expect()`, `test()`, `runner.mjs`, `expectNormalizedShape()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (3 nodes): `editProfile()`, `section()`, `profileEdit.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (3 nodes): `freshAiClient()`, `aiClient.test.js`, `setProviderEnv()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 4` to `Community 0`, `Community 1`, `Community 3`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 13`, `Community 15`, `Community 16`?**
  _High betweenness centrality (0.406) - this node is a cross-community bridge._
- **Why does `runMigrations()` connect `Community 3` to `Community 1`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 9`, `Community 13`, `Community 15`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Why does `fetchJson()` connect `Community 0` to `Community 10`, `Community 15`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `getDb()` (e.g. with `main()` and `main()`) actually correct?**
  _`getDb()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `runMigrations()` (e.g. with `freshDb()` and `freshDb()`) actually correct?**
  _`runMigrations()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `closeDb()` (e.g. with `main()` and `main()`) actually correct?**
  _`closeDb()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `fetchJson()` (e.g. with `fetchJobs()` and `fetchJobs()`) actually correct?**
  _`fetchJson()` has 12 INFERRED edges - model-reasoned connections that need verification._