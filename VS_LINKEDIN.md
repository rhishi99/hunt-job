# hunt-job vs LinkedIn — Feature Comparison

> **LinkedIn** = LinkedIn.com (Free + Premium)  
> **hunt-job** = This app — AI-powered local job search agent (evolved beyond career-ops)

---

## Job Discovery

| Feature | LinkedIn | hunt-job |
|---|:---:|:---:|
| Search across all industries & geographies | ✅ | ❌ |
| India-specific job filtering | ✅ (manual filter) | ✅ (automatic, enforced) |
| Direct scrape of company career portals | ❌ | ✅ |
| 60+ companies scannable via public API | ❌ | ✅ |
| Role synonym matching (e.g. "cloud" → k8s, infra, cloud-native) | ❌ | ✅ |
| Keyword relevance filtering (no false positives) | ❌ | ✅ |
| Job alerts / notifications | ✅ | ❌ |
| Recruiter-posted listings | ✅ | ❌ |
| Saved jobs list | ✅ | ✅ (application tracker) |
| Cached scan results (no re-scanning daily) | ❌ | ✅ (SQLite, 7-day TTL) |

---

## Job Evaluation

| Feature | LinkedIn | hunt-job |
|---|:---:|:---:|
| AI-powered job scoring | ❌ | ✅ |
| 10-dimension evaluation | ❌ | ✅ |
| Salary alignment check against your expectations | ❌ | ✅ |
| Tech stack compatibility score | ❌ | ✅ |
| Culture fit, WLB, growth opportunity signals | ❌ | ✅ |
| Apply / Maybe / Skip recommendation | ❌ | ✅ |
| Dealbreaker detection | ❌ | ✅ |
| Matches & gaps listed explicitly | ❌ | ✅ |
| Minimum apply threshold (4.0/5.0) | ❌ | ✅ |
| Salary insights (market range) | ✅ (Premium) | ❌ |

---

## Resume

| Feature | LinkedIn | hunt-job |
|---|:---:|:---:|
| Upload your existing resume | ✅ | ✅ (parsed on setup) |
| Parse resume PDF to build profile | ❌ | ✅ |
| Generate tailored resume per job | ❌ | ✅ |
| ATS keyword injection (15-20 per JD) | ❌ | ✅ |
| Reorder experience bullets by relevance | ❌ | ✅ |
| Export as PDF | ✅ (profile export) | ✅ (per-job PDF) |
| Resume attached automatically on Easy Apply | ✅ | ❌ (manual upload) |

---

## Applying

| Feature | LinkedIn | hunt-job |
|---|:---:|:---:|
| One-click Easy Apply (LinkedIn-hosted form) | ✅ | ❌ |
| Apply to external company portals | ✅ (redirect) | ✅ |
| Auto-fill external apply forms | ❌ | ✅ (Playwright, headed) |
| Platform-specific selectors (Lever / Greenhouse) | ❌ | ✅ |
| React-controlled input compatibility | ❌ | ✅ |
| Application data card (copy-paste ready) | ❌ | ✅ |
| Track submitted applications | ✅ (basic status) | ✅ |
| Application status updates from recruiter | ✅ | ❌ |

---

## Interview Preparation

| Feature | LinkedIn | hunt-job |
|---|:---:|:---:|
| AI-generated interview prep plan | ❌ | ✅ |
| Role-specific focus areas | ❌ | ✅ |
| Tech concepts to master (with difficulty levels) | ❌ | ✅ |
| System design topics | ❌ | ✅ |
| 10+ tailored behavioral questions | ❌ | ✅ |
| 4-week preparation schedule | ❌ | ✅ |
| YouTube resource links per topic | ❌ | ✅ |
| Common interview mistakes to avoid | ❌ | ✅ |
| LinkedIn Learning courses | ✅ (Premium) | ❌ |
| Interview practice (AI mock) | ✅ (Premium) | ❌ |

---

## Networking & Social

| Feature | LinkedIn | hunt-job |
|---|:---:|:---:|
| Professional networking | ✅ | ❌ |
| Recruiter InMail | ✅ (Premium) | ❌ |
| Company pages & research | ✅ | ❌ |
| Who viewed your profile | ✅ (Premium) | ❌ |
| Skill endorsements | ✅ | ❌ |
| Skills assessments / badges | ✅ | ❌ |
| Recruiter visibility | ✅ | ❌ |
| Open to Work signal | ✅ | ❌ |

---

## Privacy & Cost

| Aspect | LinkedIn | hunt-job |
|---|:---:|:---:|
| All data stored locally | ❌ | ✅ |
| Profile visible to third parties | ✅ (by design) | ❌ |
| Data sent to external servers | ✅ (LinkedIn servers) | ✅ (AI API only, no PII) |
| Free tier available | ✅ | ✅ |
| Cost | Free / ₹2,600–₹5,500/mo (Premium) | API usage cost only (~₹0.5–5 per run) |
| No ads, no algorithmic feed | ❌ | ✅ |

---

## Workflow Integration

| Feature | LinkedIn | hunt-job |
|---|:---:|:---:|
| Full workflow: discover → evaluate → prep → resume → apply | ❌ | ✅ |
| Multi-provider AI (Claude, Gemini, OpenRouter, Groq, NVIDIA) | ❌ | ✅ |
| Terminal / CLI interface | ❌ | ✅ |
| Windows `.bat` launcher | ❌ | ✅ |
| Works offline (cached scans) | ❌ | ✅ (partial) |

---

## When to Use What

| Situation | Use LinkedIn | Use hunt-job |
|---|:---:|:---:|
| Exploring job market broadly | ✅ | ❌ |
| Networking with recruiters | ✅ | ❌ |
| Applying to LinkedIn Easy Apply jobs | ✅ | ❌ |
| Evaluating if a specific JD is worth applying to | ❌ | ✅ |
| Generating a tailored resume for a specific job | ❌ | ✅ |
| Prepping for an upcoming interview | ❌ | ✅ |
| Scanning 60+ company portals at once for India roles | ❌ | ✅ |
| Keeping job search data private | ❌ | ✅ |

---

## Verdict

LinkedIn and hunt-job serve **different phases** of a job search. Use them together:

```
LinkedIn          →  Discover → Network → Signal open-to-work
hunt-job        →  Evaluate → Prepare → Apply strategically
```

LinkedIn casts the net. hunt-job makes sure every cast counts.
