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
| Lever API integration | ❌ | ✅ |
| Greenhouse API integration | ❌ | ✅ |
| Playwright-based web scraping | ✅ | ✅ (replaced by API) |
| India-only location filter | ❌ | ✅ |
| Role synonym matching (e.g. "cloud" → cloud infra, k8s, etc.) | ❌ | ✅ |
| AND-logic keyword filtering (no false positives) | ❌ | ✅ |
| Scan result caching (SQLite, 7-day TTL) | ❌ | ✅ |
| Load from cache instead of re-scanning | ❌ | ✅ |
| 30+ Indian product companies | ❌ | ✅ |
| 30+ global companies with India offices | ❌ | ✅ |

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
| SQLite scan cache | ❌ | ✅ |
| Evaluated jobs history (`data/evaluated-jobs.json`) | ✅ | ✅ |
| Applications tracker (`data/applications.json`) | ✅ | ✅ |
| Generated resumes (`data/resumes/`) | ✅ | ✅ |
| Interview prep HTML files (`data/interview-prep/`) | ❌ | ✅ |

---

## India Focus

| Feature | Original | This Fork |
|---|:---:|:---:|
| Indian companies in scanner | ✅ (config-based) | ✅ (30+ via API) |
| Global companies with India offices | ❌ | ✅ (30+ via API) |
| Filter out non-India job postings | ❌ | ✅ |
| Salary displayed in LPA (₹) | ❌ | ✅ |
| Indian city location display | ❌ | ✅ |

---

## Summary

| Metric | Original | This Fork |
|---|:---:|:---:|
| AI providers supported | 1 | 5 |
| Companies scannable via API | ~45 (scraping) | 60+ (public APIs) |
| India location enforcement | ❌ | ✅ |
| Interactive menu UI | ❌ | ✅ |
| Auto-fill browser support | ❌ | ✅ |
| Interview prep module | ❌ | ✅ |
| Scan result caching | ❌ | ✅ |
