# Career-Ops: Original vs This Fork — Feature Comparison

> **Original repo** = the base Career-Ops project as initialised (commit `8ea9225`)  
> **This fork** = rhishi99's customised build (current `main` branch)

---

## Core Features

| Feature | Original | This Fork |
|---|:---:|:---:|
| 10-dimension job evaluation | ✅ | ✅ |
| ATS-optimized resume generation (PDF) | ✅ | ✅ |
| Job portal scanning | ✅ | ✅ |
| Profile management (YAML) | ✅ | ✅ |
| Application tracker | ✅ | ✅ |
| Interview prep plan generation | ❌ | ✅ |
| YouTube resource links in prep plan | ❌ | ✅ |
| 4-week study schedule in prep plan | ❌ | ✅ |

---

## AI Provider Support

| Provider | Original | This Fork |
|---|:---:|:---:|
| Anthropic Claude | ✅ | ✅ |
| Google Gemini | ❌ | ✅ |
| OpenRouter | ❌ | ✅ |
| Groq | ❌ | ✅ |
| NVIDIA NIM | ❌ | ✅ |
| Multi-provider fallback | ❌ | ✅ |

---

## Job Scanner

| Capability | Original | This Fork |
|---|:---:|:---:|
| Direct ATS JSON APIs (Greenhouse, Lever, Ashby, SmartRecruiters) | ❌ | ✅ |
| Recruitee / Workable providers (unseeded) + JSON-LD fallback | ❌ | ✅ |
| Playwright-based web scraping | ✅ | ✅ (replaced by API) |
| India-only location filter (bypass with `--all`) | ❌ | ✅ |
| Role synonym matching (e.g. "cloud" → cloud infra, k8s, etc.) | ❌ | ✅ |
| AND-logic keyword filtering (no false positives) | ❌ | ✅ |
| SQLite upsert with content-hash dedup + change detection | ❌ | ✅ |
| Soft-close postings the ATS stops reporting ("new since last scan" is a real query) | ❌ | ✅ |
| Instant offline browse of saved jobs (`hunt-job list`) | ❌ | ✅ |
| 40+ live-verified companies across Greenhouse/Lever/Ashby/SmartRecruiters (200+ in the registry) | ❌ | ✅ |

---

## CLI & UX

| Feature | Original | This Fork |
|---|:---:|:---:|
| Individual CLI scripts (`node src/cli/...`) | ✅ | ✅ |
| Interactive terminal UI (menu-driven) | ❌ | ✅ |
| Full Apply Workflow (eval → prep → resume in one flow) | ❌ | ✅ |
| 10-dimension breakdown in Full Apply Workflow | ❌ | ✅ |
| Matches & Gaps shown in Full Apply Workflow | ❌ | ✅ |
| Score-based conditional flow (skip if < 3.0) | ❌ | ✅ |
| Profile summary on every screen | ❌ | ✅ |
| Resume parsing from PDF (auto profile setup) | ❌ | ✅ |
| `.bat` launcher for Windows | ❌ | ✅ |

---

## Apply Flow

| Feature | Original | This Fork |
|---|:---:|:---:|
| Save application to tracker | ✅ | ✅ |
| Manual apply (URL hint) | ❌ | ✅ |
| Application Data Card (copy-paste ready profile fields) | ❌ | ✅ |
| Browser auto-fill (Playwright, headed mode) | ❌ | ✅ |
| Platform detection (Lever / Greenhouse / Generic) | ❌ | ✅ |
| Platform-specific field selectors | ❌ | ✅ |
| React-controlled input compatibility | ❌ | ✅ |
| Auto-navigate to apply form (not just listing) | ❌ | ✅ |
| Confirm submission before saving to tracker | ❌ | ✅ |

---

## Data & Privacy

| Aspect | Original | This Fork |
|---|:---:|:---:|
| All data stored locally | ✅ | ✅ |
| No external uploads | ✅ | ✅ |
| Single SQLite database (`data/hunt-job.db`) | ❌ | ✅ |
| Scanned jobs, evaluations, applications, companies — all in SQLite tables | ✅ (was JSON) | ✅ |
| Generated resumes (`data/resumes/`) | ✅ | ✅ |
| Interview prep HTML files (`data/interview-prep/`) | ❌ | ✅ |

---

## India Focus

| Feature | Original | This Fork |
|---|:---:|:---:|
| Companies scanned via direct ATS APIs | ✅ (config-based) | ✅ (40+ live-verified, 200+ in registry) |
| Global companies with India offices | ❌ | ✅ (via public ATS APIs) |
| Filter out non-India job postings | ❌ | ✅ |
| Salary displayed in LPA (₹) | ❌ | ✅ |
| Indian city location display | ❌ | ✅ |

---

## Summary

| Metric | Original | This Fork |
|---|:---:|:---:|
| AI providers supported | 1 | 5 |
| Companies scannable via API | ~45 (scraping) | 40+ live-verified, 200+ in registry (public APIs) |
| India location enforcement | ❌ | ✅ |
| Interactive menu UI | ❌ | ✅ |
| Auto-fill browser support | ❌ | ✅ |
| Interview prep module | ❌ | ✅ |
| Instant offline browse (`hunt-job list`) | ❌ | ✅ |
