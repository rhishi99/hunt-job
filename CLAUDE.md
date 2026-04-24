# Hunt-Job: AI Job Search Agent

**Version:** 1.0.0
**Based on:** Career-Ops (Extended and customized)

**Original Project:** Career-Ops by Contributors
**Current Fork:** Hunt-Job

## Overview

Career-Ops is a multi-agent job search system powered by Claude and built on Claude Code. It evaluates job listings, generates tailored ATS-optimized resumes, and manages your job search through an intelligent terminal interface.

## 🎯 Core Capabilities

### 1. **Job Evaluation Mode** (`/evaluate-job`)
Analyzes job postings across 10 dimensions:
- Salary alignment
- Tech stack compatibility
- Company culture fit
- Growth opportunities
- Remote/location requirements
- Team dynamics
- Product market fit
- Work-life balance indicators
- Career progression potential
- Dealbreaker compliance

**Usage:**
- `Evaluate this job posting: [URL]`
- `Score the Data Engineer role at [Company]`

### 2. **Portal Scanning Mode** (`/scan-portals`)
Scans 45+ pre-configured company career pages for matching roles in India.

**Pre-configured Indian Companies (30+):**
- **Tech Giants:** Google, Microsoft, Amazon, Apple, Meta
- **Unicorns:** Flipkart, Swiggy, Zomato, OYO, Byju's, Unacademy
- **Fintech:** Razorpay, PhonePe, CRED
- **IT Services:** Infosys, TCS, Wipro, HCL, Tech Mahindra, Cognizant, Accenture
- **SaaS:** Freshworks, Stripe India, Atlassian, GitLab, MuleSoft
- **Emerging:** Ola Electric, Accelyst
- And more in `config/company-portals.json`

**Usage:**
- `Scan for new roles matching my [Archetype]`
- `Check Stripe's career page`

### 3. **Resume Generation Mode** (`/generate-resume`)
Creates ATS-optimized PDFs tailored to specific job listings.

**Features:**
- Extracts 15-20 most relevant keywords from JD
- Reorders experience bullets by relevance
- Generates clean, professional PDF
- Includes skill highlighting
- Maintains ATS compatibility

**Usage:**
- `Generate a resume for the Stripe job`
- `Create a tailored application package for [Job Title]`

### 4. **Profile Management** (`/profile`)
Manages your candidate profile stored locally.

**Configuration includes:**
- Base CV and proof points
- Role archetypes (e.g., Data Engineer, Product Manager)
- Salary expectations and dealbreakers
- Preferred tech stacks
- Remote/hybrid preferences

**Usage:**
- `Update my profile`
- `Add a new archetype`
- `Set my salary expectations`

### 5. **Interview Preparation Mode** (`/prepare-interview`)
Generates comprehensive interview preparation guides based on job descriptions.

**Features:**
- Bullet-point prep guide for specific role
- 10+ key focus areas tailored to job
- Tech stack concepts to master
- System design topics
- 10+ behavioral interview questions
- 4-week preparation schedule
- Common interview mistake warnings
- YouTube links for theory, tutorials, and practice problems
- Curated channels for each topic

**Usage:**
- `Prepare for this interview: [Job Description Text]`
- `Generate prep plan from job_description.txt`

### 6. **Dashboard Mode** (`/dashboard`)
Terminal-based dashboard for tracking applications (requires Go).

**Features:**
- Real-time job tracking
- Application status management
- Score trends
- Quick actions

## 📁 Directory Structure

```
career-ops/
├── CLAUDE.md                          # This file
├── package.json                       # Node dependencies
├── src/
│   ├── index.js                       # Entry point
│   ├── core/
│   │   ├── jobEvaluator.js           # 10-dimension scoring
│   │   ├── resumeGenerator.js        # PDF generation
│   │   ├── portalScanner.js          # Job portal crawler
│   │   └── profileManager.js         # Profile CRUD
│   ├── agents/
│   │   ├── evaluationAgent.js        # Claude agent for evaluation
│   │   ├── scanningAgent.js          # Claude agent for scanning
│   │   ├── resumeAgent.js            # Claude agent for resume gen
│   │   └── interviewPrepAgent.js     # Claude agent for prep guide
│   ├── templates/
│   │   ├── resume.ejs                # Resume HTML template
│   │   ├── evaluation-report.ejs     # Evaluation report template
│   │   └── interview-prep.ejs        # Interview prep template
│   └── cli/
│       ├── evaluateJob.js            # CLI: evaluate job
│       ├── scanPortals.js            # CLI: scan portals
│       ├── generateResume.js         # CLI: generate resume
│       ├── prepareInterview.js       # CLI: generate interview prep
│       ├── profileInit.js            # CLI: initialize profile
│       └── profileEdit.js            # CLI: edit profile
├── config/
│   ├── company-portals.json          # Pre-configured job portals
│   ├/profile.yml                     # User profile (generated)
│   └── settings.json                 # Claude Code settings
├── modes/
│   └── _profile.md                   # Profile storage (generated)
├── data/
│   ├── evaluated-jobs.json           # History of evaluated jobs
│   ├── applications.json             # Application tracking
│   ├── resumes/                      # Generated resume PDFs
│   └── interview-prep/               # Generated prep plans
├── cmd/
│   └── dashboard/
│       └── main.go                   # Terminal dashboard (Go)
└── scripts/
    ├── setup.sh                      # Initial setup
    └── update-portals.sh             # Update company portals
```

## 🚀 Getting Started

### Initial Setup
1. Ensure Node.js is installed: `node --version`
2. Install dependencies: `npm install`
3. Initialize your profile: `npm run profile:init`
4. Configure your API: `export ANTHROPIC_API_KEY=your_key`

### First Job Evaluation
```bash
node src/cli/evaluateJob.js "https://job-posting-url"
```

### Scanning Job Portals
```bash
node src/cli/scanPortals.js --archetype "Data Engineer" --company "Stripe"
```

### Generate Tailored Resume
```bash
node src/cli/generateResume.js --job-id "job_123"
```

### Prepare for Interview
```bash
node src/cli/prepareInterview.js "Paste job description here" 
node src/cli/prepareInterview.js job_description.txt
```

## 🔑 Key Files

### Profile Configuration
- **Location:** `config/profile.yml` and `modes/_profile.md`
- **Contains:**
  - Work experience and accomplishments
  - Target archetypes
  - Salary requirements
  - Tech stack preferences
  - Dealbreakers

### Company Portals
- **Location:** `config/company-portals.json`
- **Contains:** 45+ pre-configured companies with career page URLs

### Job Evaluation Scoring
- **Algorithm:** 10-dimension scoring system
- **Minimum Apply Threshold:** 4.0/5.0
- **Dimensions:** Salary, tech stack, culture, growth, location, team, product, WLB, progression, dealbreakers

## ⚙️ Configuration

### Environment Variables
```bash
ANTHROPIC_API_KEY=your_api_key           # Required: Anthropic API key
CLAUDE_MODEL=claude-3-5-sonnet-20241022  # Optional: Model to use
SCANNING_MODEL=claude-3-5-haiku          # Optional: Faster model for scanning
```

### Settings (settings.json)
See `config/settings.json` for Claude Code customization:
- Model preferences
- API timeout settings
- Resume template preferences
- Dashboard refresh rate

## 🎓 Workflow

1. **Onboarding** → Run once to create your profile
2. **Scanning** → Get alerts when new matching jobs appear
3. **Evaluation** → Review scores and analytical reports
4. **Generation** → Create tailored resumes for high-scoring jobs
5. **Interview Prep** → Generate personalized prep plans with YouTube links
6. **Review & Submit** → You remain the final human gatekeeper
7. **Tracking** → Monitor application status in dashboard

## 💡 Pro Tips

- **Be specific during onboarding:** Input detailed projects, metrics, and accomplishments
- **Monitor token usage:** Use Haiku for scanning, Sonnet for resume generation
- **Set realistic thresholds:** Don't apply to jobs below 4.0 score
- **Prep early:** Generate interview prep guides 2-4 weeks before interviews
- **Follow YouTube schedule:** Use the 4-week prep plan with curated YouTube channels
- **Review before submitting:** Always verify AI-generated content
- **Keep profiles updated:** Refresh your profile quarterly with new projects
- **India Focus:** All 30+ companies are hiring in India with established offices

## 🔒 Privacy & Security

All user data is stored **locally** on your machine:
- Profile information: `modes/_profile.md`, `config/profile.yml`
- Evaluated jobs: `data/evaluated-jobs.json`
- Applications: `data/applications.json`
- Generated resumes: `data/resumes/` (never uploaded)

No data is sent to external servers except:
- Job listings (public URLs only)
- Claude API (for analysis)

## 📚 API Reference

### Job Evaluator
```javascript
const evaluator = new JobEvaluator(profile);
const score = await evaluator.evaluate(jobPosting);
// Returns: { score: 4.2, report: {...}, matches: [], mismatches: [] }
```

### Resume Generator
```javascript
const generator = new ResumeGenerator(profile);
const pdf = await generator.generate(jobPosting, resume);
// Returns: PDF file path
```

### Portal Scanner
```javascript
const scanner = new PortalScanner(config);
const jobs = await scanner.scan(['anthropic', 'stripe']);
// Returns: Array of job postings
```

### Interview Prep Generator
```javascript
const prep = new InterviewPrep();
const plan = await prep.generatePrepPlan(jobDescription, profile);
// Returns: {
//   focusAreas: [...],
//   conceptsToMaster: [...],
//   interviewRounds: [...],
//   weeklyPlan: {...},
//   behavioralQuestions: [...],
//   youtubeResources: {...}
// }
```

## 🤝 Contributing

This is an open-source project. Feel free to:
- Add new company portals
- Improve evaluation dimensions
- Enhance resume templates
- Submit bug reports

## 📄 License

MIT License - See LICENSE file

## 🆘 Troubleshooting

**Q: API key not working**
A: Ensure ANTHROPIC_API_KEY is set: `echo $ANTHROPIC_API_KEY`

**Q: Resume PDF generation fails**
A: Install Playwright browsers: `npx playwright install`

**Q: Portal scanner returns no results**
A: Check internet connection and company portal URLs in `config/company-portals.json`

**Q: Profile not saving**
A: Ensure `config/` and `modes/` directories exist and have write permissions

---

**Built with ❤️ using Claude & Claude Code**
**Extended from:** Career-Ops (See project documentation for original features)
