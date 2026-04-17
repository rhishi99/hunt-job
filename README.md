# Career-Ops: AI-Powered Job Search Agent

An intelligent multi-agent job search system powered by Claude and Claude Code. Career-Ops evaluates job listings across 10 dimensions, generates ATS-optimized tailored resumes, and helps you manage your job search strategically.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Anthropic API key (from Claude dashboard)
- (Optional) Go for terminal dashboard

### Installation

```bash
# Clone and navigate
git clone <repo-url>
cd career-ops

# Install dependencies
npm install

# Set API key
export ANTHROPIC_API_KEY=your_api_key

# Initialize your profile
npm run profile:init
```

### First Steps

```bash
# Evaluate a job posting
npm run evaluate-job -- "https://example.com/job-posting"

# Scan Indian company portals
npm run scan-portals -- --archetype "Data Engineer"

# Generate tailored resume
npm run generate-resume -- job_123

# Prepare for interview with YouTube links
npm run prepare-interview -- "Paste job description here"
npm run prepare-interview -- job_description.txt
```

## 📚 Features

### 1. Intelligent Job Evaluation
Scores jobs across 10 dimensions:
- Salary alignment
- Tech stack compatibility
- Company culture fit
- Growth opportunities
- Remote/location requirements
- Team dynamics
- Product market fit
- Work-life balance
- Career progression
- Dealbreaker compliance

Only apply to jobs scoring 4.0 or higher.

### 2. Portal Scanning - India Focused
Scans 30+ pre-configured Indian company career pages:
- **Tech Giants:** Google, Microsoft, Amazon, Apple, Meta
- **Unicorns:** Flipkart, Swiggy, Zomato, OYO, Byju's, Unacademy
- **Fintech:** Razorpay, PhonePe, CRED
- **IT Services:** Infosys, TCS, Wipro, HCL, Tech Mahindra
- **SaaS:** Freshworks, Stripe India, Atlassian, GitLab

### 3. Resume Generation
Generates ATS-optimized PDFs:
- Extracts 15-20 most relevant keywords
- Reorders experience bullets by relevance
- Highlights quantifiable achievements
- Professional, scannable format

### 4. Interview Preparation
Generates personalized prep guides with YouTube resources:
- 5-8 critical focus areas for the specific role
- Tech stack concepts to master by difficulty
- 10+ tailored behavioral questions
- System design topics
- 4-week preparation schedule
- Common interview mistakes to avoid
- **YouTube links** for theory, tutorials, practice problems
- **Curated channels** for each topic

### 5. Profile Management
Stores your information locally:
- Work experience and projects
- Skills and certifications
- Salary expectations and preferences
- Dealbreakers and constraints

## 📖 Usage

### Initialize Profile
```bash
npm run profile:init
```

Interactive setup wizard walks you through:
- Personal information
- Target archetypes
- Salary expectations
- Tech stack preferences
- Dealbreakers

### Evaluate Job Posting
```bash
npm run evaluate-job -- "https://company.com/jobs/123"
```

Returns:
- Overall score (1-5.0)
- Dimension breakdown
- Key matches and mismatches
- Recommendation (Apply/Maybe/Skip)

### Scan Job Portals (India)
```bash
# Scan for Data Engineer roles in Indian companies
npm run scan-portals -- --archetype "Data Engineer"

# Scan specific Indian companies
npm run scan-portals -- --archetype "Backend Engineer" --companies "Flipkart,Amazon India,Microsoft India"
```

### Generate Tailored Resume
```bash
npm run generate-resume -- job_123
```

Creates PDF with:
- Relevant keywords highlighted
- Experience reordered by relevance
- Achievement-focused bullet points

### Generate Interview Prep Plan
```bash
# Paste job description directly
npm run prepare-interview -- "Senior Backend Engineer at Flipkart..."

# Or use a file
npm run prepare-interview -- job_description.txt
```

Output includes:
- 5-8 focus areas for the role
- Concept breakdown by category
- Interview round expectations
- 4-week study schedule
- YouTube links for each topic
- Behavioral questions
- Common mistakes to avoid

## 🏗️ Architecture

### Core Modules

- **ProfileManager** - Manages your candidate profile
- **JobEvaluator** - Scores jobs across 10 dimensions
- **ResumeGenerator** - Creates tailored resumes with Playwright
- **PortalScanner** - Scans 30+ Indian company career pages
- **InterviewPrep** - Generates prep plans with YouTube resources

### Data Storage

All data stored locally on your machine:
- `config/profile.yml` - Your profile
- `modes/_profile.md` - Markdown version
- `data/evaluated-jobs.json` - Job history
- `data/applications.json` - Application tracking
- `data/resumes/` - Generated PDFs

## ⚙️ Configuration

### Environment Variables
```bash
ANTHROPIC_API_KEY=sk_xxx          # Required
CLAUDE_MODEL=claude-3-5-sonnet    # Optional, default: Sonnet
SCANNING_MODEL=claude-3-5-haiku   # Optional, faster for scanning
```

### Settings (config/settings.json)
- Model preferences
- Resume template options
- Evaluation thresholds
- Dashboard refresh rate

## 💡 Pro Tips

1. **Quality over Quantity** - Focus on high-scoring jobs (4.0+)
2. **Monitor Tokens** - Use Haiku for scanning, Sonnet for fine work
3. **Prep Early** - Generate interview prep 2-4 weeks before interviews
4. **Follow YouTube Schedule** - Use the 4-week plan with curated channels
5. **Keep Profile Fresh** - Update quarterly with new projects
6. **Review PDFs** - Always verify before submitting
7. **Track Everything** - Review evaluation history for patterns
8. **India Jobs** - All 30+ companies actively hire in India with local offices

## 📊 Workflow

1. **Onboarding** - Set up your profile once
2. **Scanning** - Get alerts for new matching jobs
3. **Evaluation** - Review scores and analysis
4. **Generation** - Create tailored resumes for top jobs
5. **Review & Submit** - You're the final human decision-maker
6. **Tracking** - Monitor application status

## 🔐 Privacy

- All data stored **locally**
- No profile sent to external servers
- Only job URLs and analysis sent to Claude API
- Generated PDFs never uploaded

## 🐛 Troubleshooting

**API key not working:**
```bash
echo $ANTHROPIC_API_KEY  # Verify it's set
```

**Resume PDF fails:**
```bash
npx playwright install  # Install browsers
```

**No results from portals:**
- Check internet connection
- Verify URLs in `config/company-portals.json`

## 📝 License

MIT License

## 🤝 Contributing

Feel free to:
- Add new company portals
- Improve evaluation dimensions
- Enhance resume templates
- Report bugs

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review CLAUDE.md for detailed features
3. Check config/company-portals.json for available companies

---

Built with ❤️ using Claude and Claude Code
