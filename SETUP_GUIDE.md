# Career-Ops Setup & Usage Guide

## Table of Contents
1. [Installation & Setup](#installation--setup)
2. [Claude Code Integration](#claude-code-integration)
3. [Workflow for Maximum Efficiency](#workflow-for-maximum-efficiency)
4. [Real-World Examples](#real-world-examples)
5. [Pro Tips for Faster Results](#pro-tips-for-faster-results)

---

## Installation & Setup

### Prerequisites
- **Node.js 16+** - [Download](https://nodejs.org/)
- **At least one AI provider API key** (see options below)
- **VS Code or Terminal** - For running commands

### AI Provider Options

Choose ANY of these (or combine multiple):

| Provider | Cost | Setup | Use Case |
|---|---|---|---|
| **🟢 Gemini (Google)** | FREE tier: 60 req/min, 1500 rpm | [Get API Key](https://aistudio.google.com) | ✅ **Best for starting** — Free, generous limits |
| **🟢 Groq** | FREE tier: 100+ calls/day | [Get API Key](https://console.groq.com) | ✅ **Fast & free** — Low-cost scanning |
| **🔵 OpenRouter** | Pay-as-you-go ($0.0005-0.002/1K tokens) | [Get API Key](https://openrouter.ai/keys) | ✅ **Most models** — Access 100+ models |
| **🟣 NVIDIA NIM** | FREE tier: 1000 tokens/day | [Get API Key](https://integrate.api.nvidia.com) | ✅ **Local inference** — On-device capability |
| **⭐ Claude (Anthropic)** | Paid: $0.03-0.30/1K tokens | [Get API Key](https://console.anthropic.com) | ✅ **Best quality** — For final resumes/evaluations |

**Recommendation for getting started:**
1. Start with **Gemini (free tier)** — Instant setup, no payment needed
2. Add **Groq** for faster scanning (also free)
3. Add **Claude** later when you need best quality for resumes

### Step 1: Clone and Install

```bash
git clone https://github.com/rhishi99/hunt-job.git
cd hunt-job
npm install
npx playwright install chromium   # for resume PDF + auto-fill
```

### Step 2: Get Your First API Key (Pick ONE)

**Option A: Gemini (Recommended - Fastest Start)**
```bash
# 1. Go to https://aistudio.google.com
# 2. Click "Get API Key" (free tier available)
# 3. Copy your key

export GEMINI_API_KEY="your_key_here"
npm run setup  # Interactive setup will detect it
```

**Option B: Groq (Also Free)**
```bash
# 1. Go to https://console.groq.com
# 2. Create account, generate API key
# 3. Copy your key

export GROQ_API_KEY="your_key_here"
npm run setup
```

**Option C: Claude (Paid - Best Quality)**
```bash
# 1. Go to https://console.anthropic.com
# 2. Add payment method (get $5 free credits first)
# 3. Generate API key

export ANTHROPIC_API_KEY="sk-ant-your_key_here"
npm run setup
```

**Option D: Multiple Providers (Recommended Eventually)**
```bash
# Set multiple keys - app will use fastest available
export GEMINI_API_KEY="..."
export GROQ_API_KEY="..."
export ANTHROPIC_API_KEY="sk-ant-..."

# Or create .env file
cat > .env << 'EOF'
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
ANTHROPIC_API_KEY=sk-ant-your_claude_key
EOF

npm run setup
```

### Step 3: Verify API Key is Set

```bash
# Check which providers are available
npm run setup  # Shows detected API keys

# Or manually verify
echo $GEMINI_API_KEY      # Should show key if set
echo $GROQ_API_KEY         # Should show key if set
echo $ANTHROPIC_API_KEY    # Should show key if set
```

### Step 4: Initialize Your Profile

```bash
# Interactive profile setup (takes 5 minutes)
npm run profile:init
```

**What to provide:**
- Your full name and contact details
- Current role and years of experience
- **Target Archetypes** (be specific!):
  - "Backend Engineer"
  - "Data Engineer"
  - "Full Stack Engineer"
- **Salary expectations** (in INR for India)
- **Tech stack preferences** (Python, Java, Go, etc.)
- **Dealbreakers** (relocation, remote-only, etc.)

### Step 5: Test Your Setup

```bash
# Quick test with your configured provider
npm run evaluate-job -- "https://careers.flipkart.com/jobs/backend-engineer"

# Should show a score (if it works, you're ready!)
```

### Feature Status: What's Implemented vs What's Not

#### ✅ Fully Implemented & Working

- **Job Evaluation** (10 dimensions) — Works with all providers
- **Portal Scanning** (~108 companies) — Lever (~56) + Greenhouse (~52), sorted newest-first
- **Early-Applier Advantage** — 🔥 badge on jobs posted < 48h, sorted by recency
- **Resume Generation** (ATS-optimized PDF) — Tailored per job
- **Interview Prep** (4-week schedule + YouTube links) — Role-specific
- **Profile Management** (YAML-based) — Local storage
- **Profile Editor** — Edit specific sections without re-running full init
- **Auto-fill Apply** (Lever & Greenhouse forms) — Browser automation
- **Application Tracker** (JSON-based) — Manage applications, tracks duplicates
- **Resume Parser** (PDF to profile) — Extract your resume data
- **Multi-provider AI** (Gemini, Groq, OpenRouter, NVIDIA, Claude) — Auto-selects available

#### ❌ Not Implemented (Original Scope Items)

- **Dashboard Mode** (Go terminal UI) — `npm run dashboard` is wired but no Go code exists; interactive menu replaces it
- **Slash Commands** (e.g., `/evaluate-job`) — Original used Claude Code slash commands; use the interactive menu or `career-ops.bat` instead

---

### Step 5: Add Your Experience (Optional but Recommended)

Create `config/profile.yml` manually or via CLI:

```yaml
name: Your Name
email: your@email.com
phone: "+91-XXXXX-XXXXX"
currentRole: "Senior Software Engineer"
yearsOfExperience: 5

archetypes:
  - "Backend Engineer"
  - "Data Engineer"

salary:
  min: 1500000
  max: 3000000
  currency: "INR"

remotePreference: "Hybrid"

techStack:
  - "Python"
  - "Java"
  - "Golang"
  - "PostgreSQL"
  - "Docker"
  - "Kubernetes"

dealbreakers:
  - "Requires relocation"
  - "Less than 15 LPA"

experience:
  - title: "Senior Engineer"
    company: "Tech Company"
    startDate: "2021-01"
    endDate: "Present"
    description: "Led backend team, designed microservices"

skills:
  - "System Design"
  - "API Development"
  - "Distributed Systems"
  - "Team Leadership"

projects:
  - title: "Notification Service"
    description: "Built real-time notification system handling 1M+ events/day"
    technologies: ["Python", "RabbitMQ", "PostgreSQL"]
```

### Step 6: Verify Setup

```bash
# Test each command
npm run evaluate-job -- "https://careers.flipkart.com/jobs/backend-engineer"
npm run scan-portals -- --archetype "Backend Engineer"
npm run prepare-interview -- "Job Description"

# Should see successful outputs without errors
```

---

## Claude Code Integration (Optional - For Faster Workflows)

### About Claude Code

Claude Code is Anthropic's official CLI tool that lets you interact with Claude directly in your terminal. It can orchestrate Career-Ops commands, batch process jobs, and provide AI analysis.

**Note:** Claude Code is OPTIONAL. Career-Ops works fine with just the CLI commands. This section is for power users who want faster, more interactive workflows.

### Installation (Optional)

```bash
# Install Claude Code globally (optional)
npm install -g @anthropic-ai/claude-code

# Authenticate
claude login

# Verify installation
claude --version
```

### Using Claude Code with Career-Ops

Claude Code works with ANY of your configured AI providers (Gemini, Groq, OpenRouter, NVIDIA, Claude).

#### 1. **Start Claude Code in Project Directory**

```bash
cd ~/projects/hunt-job
claude  # Starts Claude Code session
```

#### 2. **Interactive Mode Commands**

Once Claude Code is running, you can give natural language commands:

```
# Evaluate a job
"Evaluate this job for me: https://careers.google.com/jobs/backend"

# Scan for jobs
"Scan for Data Engineer roles at Amazon India and Google"

# Generate resume
"Generate a tailored resume for the job I just evaluated"

# Prepare interview
"Create an interview prep plan for the Google Data Engineer role
with YouTube learning resources"

# Get recommendations
"Which of the evaluated jobs should I focus on? Show analysis"

# Check application status
"Show me my evaluated jobs with scores > 4.0"
```

#### 3. **Direct API Integration in Claude Code**

You can ask Claude to:
- Analyze your evaluation reports
- Compare job opportunities
- Create study schedules
- Draft cover letters
- Review your resume
- Suggest interview questions

---

## Workflow for Maximum Efficiency

### The 3-Phase Intensive Job Search Workflow

```
PHASE 1: DISCOVERY (30 mins/day)
↓
PHASE 2: APPLICATION (1-2 hours/day)
↓
PHASE 3: PREPARATION (2-3 hours/day)
```

### Phase 1: Discovery & Evaluation (30 mins)

**Goal:** Find 5-10 jobs worth applying to

**Steps:**

```bash
# 1. Scan multiple company portals
npm run scan-portals -- --archetype "Your Target" --companies "Flipkart,Google,Amazon India"

# 2. Evaluate each job (2 mins each)
npm run evaluate-job -- "https://company.com/job-1"
npm run evaluate-job -- "https://company.com/job-2"

# 3. Filter for scores >= 4.0
# (View data/evaluated-jobs.json)
```

**Use with Claude Code:**

```
"I just evaluated 8 jobs. Show me only the ones scoring 4.0 or higher
and rank them by salary alignment first"
```

### Phase 2: Application (1-2 hours)

**For each high-scoring job:**

**Step 1: Generate Tailored Resume** (15 mins)

```bash
npm run generate-resume -- job_<job_id>
```

**Step 2: Review with Claude Code** (10 mins)

```
"Review this generated resume and suggest improvements:
- Check if keywords from the job posting are highlighted
- Ensure metrics and achievements are quantifiable
- Verify ATS compatibility"
```

**Step 3: Apply** (5 mins)
- Submit on company portal
- Track in `data/applications.json`

**Phase 2 Timeline:**
- Job 1: 9:00-9:30 AM (Evaluate, Generate Resume, Apply)
- Job 2: 9:30-10:00 AM (Evaluate, Generate Resume, Apply)
- Job 3: 10:00-10:30 AM (Evaluate, Generate Resume, Apply)

### Phase 3: Interview Preparation (2-3 hours)

**Start 2-4 weeks before first interview**

**Step 1: Generate Interview Prep Plan** (5 mins)

```bash
npm run prepare-interview -- "Job Description Pasted Here"
# or
npm run prepare-interview -- job_description.txt
```

**Step 2: Study Structure** (Follow 4-week plan)

**Week 1: Fundamentals** (10 hours)
```
Monday: DSA Basics + LeetCode Easy (YouTube: Abdul Bari)
Tuesday: Database Design (YouTube: Hussein Nasser)
Wednesday: System Design Intro (YouTube: Gaurav Sen)
Thursday: OOPS Concepts (YouTube: Kunal Kushwaha)
Friday: Behavioral Question Prep
```

**Week 2: Deep Dive** (10 hours)
```
Monday-Friday: LeetCode Medium Problems
                System Design Case Studies
                Company-specific tech stack
```

**Week 3: Advanced Topics** (10 hours)
```
Specialized topics from prep plan
Interview round simulation
Behavioral mock interviews
```

**Week 4: Polish** (5 hours)
```
Mock interviews
Review weak areas
Rest and confidence building
```

**Step 3: Use YouTube Resources** (Auto-generated)

Claude generates YouTube links:
- `youtubeResources[topic].theory` - Learn concepts
- `youtubeResources[topic].practice` - Solve problems
- `youtubeResources[topic].channels` - Curated channel links

**Step 4: Interactive Study with Claude Code**

```
"I'm studying system design for the Flipkart interview.
Create me a 1-hour study session including:
1. Concept explanation (via YouTube if needed)
2. Design patterns used in Flipkart systems
3. Practice problem
4. Follow-up questions to expect"
```

---

## Real-World Examples

### Example 1: Fast-Track Application (30 mins)

**Scenario:** You see a job opening you're interested in

```bash
# 1. Evaluate (2 mins)
npm run evaluate-job -- "https://careers.flipkart.com/jobs/backend-engineer-2024"

# Output shows: Score 4.5/5.0 ✅

# 2. Generate Resume (5 mins)
npm run generate-resume -- job_1234567890

# Output: resume_1234567890.pdf created ✅

# 3. Review with Claude Code (10 mins)
claude
> "Quick review: Does this resume match the Flipkart backend role requirements?"
> "Does it have the right keywords?"
> "Is it ATS-friendly?"

# 4. Apply on portal (10 mins)
# Upload resume, fill form, submit ✅

# 5. Track (1 min)
# Save to data/applications.json with date and score
```

### Example 2: Interview Prep for Dream Job (3 days intensive)

**Day 1: Setup Prep Plan**

```bash
# Get job description
# Save to job_description.txt

# Generate plan
npm run prepare-interview -- job_description.txt

# Output includes:
# - 8 focus areas
# - 4-week schedule
# - YouTube links
# - Behavioral questions
```

**Day 2: Intensive Study**

```
Morning (2 hours):
- Watch: Gaurav Sen - System Design Basics (YouTube)
- Study: Focus Areas 1-3
- LeetCode: 5 Medium problems

Afternoon (2 hours):
- Study: Focus Areas 4-6
- System Design: Design a Twitter-like service
- Behavioral: Practice 3 questions

Evening (1 hour):
- YouTube: Deep dive on weak area
- Practice: 3 more LeetCode problems
```

**With Claude Code:**

```
"I'm preparing for Flipkart SDE-2 interview.
Today I'll focus on: System Design, Distributed Systems, Problem Solving.

Create a personalized study plan for today including:
1. Key concepts I MUST know
2. LeetCode problems to solve
3. System design topics to cover
4. YouTube resources for each
5. Practice questions to expect in interview"
```

**Day 3: Mock Interview**

```
"Conduct a mock system design interview.

Ask me to design: [Real Flipkart System]

Evaluate on:
- Problem understanding
- Architecture decisions
- Scalability considerations
- Trade-offs discussion
- Implementation details

Give feedback on what I need to improve."
```

### Example 3: Parallel Job Search (Multiple Companies)

**Target:** Apply to 10 companies in 1 week

```bash
# Monday: Scan and evaluate
npm run scan-portals -- --archetype "Backend Engineer" \
  --companies "Flipkart,Amazon India,Microsoft India,Google,Meta"

# Result: 12 jobs matching criteria

# Evaluate all (10 mins)
npm run evaluate-job -- "job_1_url"
npm run evaluate-job -- "job_2_url"
# ... (10 jobs)

# Filter scores >= 4.0 → 8 jobs qualified ✅
```

```bash
# Tuesday-Thursday: Applications (3 hours/day)
# Day 1: Generate resumes for jobs 1-3, Apply
# Day 2: Generate resumes for jobs 4-6, Apply
# Day 3: Generate resumes for jobs 7-8, Apply
```

```bash
# Friday-Sunday: Interview Prep
# Start with company #1 (highest score)
npm run prepare-interview -- flipkart_job_description.txt

# Start Claude Code session
claude

# Run interactive prep sessions for each company
"Prepare me for Flipkart backend interview"
"Create mock interview #1"
"Practice system design question"
```

---

## Pro Tips for Faster Results

### 1. **Batch Evaluations (Save 50% Time)**

```bash
# Instead of evaluating one-by-one:
# Create: urls.txt with one URL per line

for url in $(cat urls.txt); do
  npm run evaluate-job -- "$url"
done

# All evaluations done in parallel with Claude Code
```

### 2. **Resume Template Strategy**

Keep 2-3 base resume variations:
- **Generic:** Strong profile, all skills
- **Backend:** Emphasize system design, scalability
- **Data:** Emphasize analytics, ML, databases

```bash
# Generate from base, then customize
npm run generate-resume -- job_id > tailored_resume.pdf
# Customize in PDF editor for final touches
```

### 3. **Interview Prep Shortcuts**

```bash
# Don't wait for full 4-week plan if interview is soon
# Ask Claude Code:

"Interview is in 5 days. Create a crash course for:
- System Design (most critical)
- 20 LeetCode-style problems
- 10 behavioral Q&A
- Focus on gaps only"
```

### 4. **Use Claude Code as Your Study Partner**

```
"I'm weak in Database Design. 
Create a 2-day intensive course including:
- Key concepts
- YouTube tutorials (with links)
- Practice problems from LeetCode
- Mock questions
- Assessment quiz"
```

### 5. **Leverage Application Tracking**

```bash
# After each application, update:
# data/applications.json

{
  "applicationId": "app_001",
  "company": "Flipkart",
  "position": "Backend Engineer",
  "appliedDate": "2024-04-18",
  "jobScore": 4.5,
  "status": "Applied",
  "followUpDate": "2024-05-02",
  "notes": "Strong alignment with microservices role"
}

# With Claude Code:
"Show me my application timeline and suggest follow-up actions"
```

### 6. **YouTube Learning Optimization**

Career-Ops provides YouTube links automatically. Optimize viewing:

```
Watch Time: 2-3x speed (if comfortable)
Channels:   Subscribe to curated ones for notifications
Notes:      Keep parallel notes in Markdown
Practice:   Implement what you learn immediately
```

**Recommended Channels from Career-Ops:**

| Topic | Channel | Why |
|-------|---------|-----|
| DSA | Abdul Bari | Best explanations, theory-heavy |
| System Design | Gaurav Sen | Real-world problems, interview-focused |
| Databases | Hussein Nasser | Deep technical dives |
| Cloud | TechWorld with Nana | Practical, hands-on approach |
| Languages | Kunal Kushwaha | Beginner to advanced |
| React/Frontend | The Net Ninja | Clear, structured tutorials |

### 7. **Claude Code for Daily Standup**

Start each day with:

```
"Good morning! 
Today I'll focus on [area].
Generate a personalized learning schedule including:
1. What I should study
2. LeetCode problems
3. Mock questions
4. YouTube resources
5. Time estimates"
```

### 8. **Parallel Preparation Strategy**

If you have 2+ interviews in same period:

```
Week 1: Both companies → Common topics (System Design, DSA)
Week 2: Company A → Specific topics
Week 3: Company B → Specific topics
Week 4: Both → Mock interviews, refinement
```

---

## Daily Workflow Template

### Morning (30 mins)
```bash
# 1. Check Claude Code for daily plan
claude
> "What should I prepare today based on my upcoming interviews?"

# 2. Scan portals for new jobs
npm run scan-portals -- --archetype "Your Target"

# 3. Evaluate promising jobs
npm run evaluate-job -- "URL"
```

### Afternoon (2 hours)
```bash
# Study session with YouTube resources
# Follow the 4-week prep schedule from npm run prepare-interview

# Use Claude Code for interactive learning
claude
> "Quiz me on [topic]"
> "Solve this problem step by step with me"
```

### Evening (1-2 hours)
```bash
# Application round
# For each job with score >= 4.0:
npm run generate-resume -- job_id
# Review with Claude Code
# Apply on company portal
```

### Weekly (30 mins)
```bash
# Review progress
claude
> "Show me my applications and interview prep progress"
> "What topics should I focus on for next week?"
> "Which interviews are coming up? Let's prep priority order."
```

---

## Troubleshooting

### API Key Issues
```bash
# Verify key is set
echo $ANTHROPIC_API_KEY

# Set if missing
export ANTHROPIC_API_KEY="sk_ant_..."

# For permanent setup:
echo "export ANTHROPIC_API_KEY='sk_ant_...'" >> ~/.bashrc
source ~/.bashrc
```

### Resume PDF Not Generating
```bash
# Reinstall Playwright browsers
npx playwright install chromium

# Try again
npm run generate-resume -- job_id
```

### Profile Not Found
```bash
# Initialize profile
npm run profile:init

# Verify file created
cat config/profile.yml
cat modes/_profile.md
```

### Claude Code Not Working
```bash
# Update Claude Code
npm install -g @anthropic-ai/claude-code@latest

# Re-authenticate
claude login

# Start fresh session
claude
```

---

## Expected Results Timeline

**Week 1:**
- ✅ Setup complete
- ✅ 5-10 applications submitted
- ✅ Interview prep plan started

**Week 2-3:**
- ✅ 15-20 total applications
- ✅ 2-3 interview calls received
- ✅ Prep plan 50% complete

**Week 4:**
- ✅ 1-2 job offers expected
- ✅ Strong interview performance
- ✅ Ready for multiple rounds

---

---

## Provider Selection & Cost Optimization

### Free Model Strategy (Recommended)

Use **Gemini + Groq** for 90% of your work (completely free):

```bash
export GEMINI_API_KEY="your_gemini_key"
export GROQ_API_KEY="your_groq_key"
npm run setup
```

**Why this works:**
- **Scanning** (15-20 mins/week) → Use Groq (fast & free)
- **Evaluation** (5-10 mins/week) → Use Gemini (free tier sufficient)
- **Resume generation** → Happens rarely, use Gemini (works fine for most)
- **Interview prep** → Use Gemini (works great)

**Monthly cost: $0**

### When to Add Claude (Optional)

Only add Claude API when you need best-in-class quality:
- Evaluating your dream job (needs perfect analysis)
- Final resume for top-tier company (needs polished output)
- Complex interview prep (needs nuanced guidance)

**Cost: ~$0.30-0.50/month** (very reasonable for occasional use)

### When to Use OpenRouter

If free tiers are exhausted and you want more models:
```bash
export OPENROUTER_API_KEY="your_key"
```

**Cost: $0.0005-0.002 per 1K tokens** (super cheap, pay-as-you-go)

### Multi-Provider Setup (Best Practice)

```bash
# .env file with multiple providers
GEMINI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...

# App automatically selects the best available
# Priority: Set in PRIORITY_ORDER in config/settings.json
```

The app will use providers in this order:
1. First available provider with available quota
2. Fallback if one hits rate limits
3. You can force a provider with: `AI_PROVIDER=groq npm run evaluate-job -- ...`

---

## Advanced Optimization Strategies

### Token Optimization

**Strategy 1: Batch Similar Requests**
- ❌ Inefficient: 10 separate evaluations (40K tokens)
- ✅ Efficient: 1 smart batch prompt (15K tokens = 60% savings)

**Strategy 2: Use Haiku for Filtering, Sonnet for Polish**
```bash
SCANNING_MODEL=claude-3-5-haiku-20241022 npm run scan-portals -- ...  # Cheap
CLAUDE_MODEL=claude-3-5-sonnet-20241022 npm run generate-resume -- ...  # Quality
```

### Speed Optimization

**Speed Hack 1: Parallel Job Evaluations**
```bash
claude
> "I have these 10 job URLs. Evaluate all in parallel.
   Show me scores and top 5 to apply to."
```
Time saved: 10 mins on 10 jobs

**Speed Hack 2: Keyboard Aliases**
```bash
alias ev='npm run evaluate-job --'
alias gen='npm run generate-resume --'
alias prep='npm run prepare-interview --'
alias scan='npm run scan-portals --'
```

**Speed Hack 3: Batch Resume Generation**
```bash
for id in job_1 job_2 job_3; do npm run generate-resume -- $id & done
wait  # Parallel > serial, saves 5 mins on 5 resumes
```

### Quality Optimization

**Quality Hack 1: Specific Feedback to Claude**
```
❌ Generic: "Review my resume"
✅ Specific: "Review against Flipkart JD for:
   - System design keywords prominent?
   - ATS-friendly (no images)?
   - Metric-focused bullets?
   - Tech stack match?"
```

**Quality Hack 2: Iterative Refinement**
1. Generate resume
2. Claude reviews
3. You provide feedback
4. Claude revises
5. Repeat until satisfied (100% better output)

### Application Velocity: Target 10/Week

**Daily Schedule:**
- Monday: Scan + Evaluate (6 jobs)
- Tuesday: Generate Resumes (3 jobs) + Apply
- Wednesday: Generate Resumes (3 jobs) + Apply
- Thursday-Friday: Interview prep + Follow-ups

**Time: 2-3 hours/day**

### Interview Prep Optimization

**7-Day Crash Course** (instead of 4 weeks):
```
Day 1: Fundamentals + 2 YouTube tutorials (3 hrs)
Day 2: DSA problems (3 hrs, 6 problems)
Day 3: System design (4 hrs, 2 case studies)
Day 4: Advanced topics (3 hrs)
Day 5-6: Mock interviews (4 hrs)
Day 7: Rest + light review
Total: 20 hours vs 40 hours
```

**3-Day Intensive** (if truly desperate):
```bash
claude
> "I have 3 days until my interview.
   Create a crash course:
   - Top 3 most likely topics
   - 10 must-solve problems
   - 2 mock interviews
   Focus only on essentials (6 hrs/day)"
```

### Sustainable Preparation

**Don't:**
- 8+ hours/day (unsustainable)
- 100+ LeetCode problems (diminishing returns)
- 24/7 prep (mental fatigue)

**Do:**
- 2-3 focused hours/day
- 20-30 quality problems
- Sleep well, exercise 30 mins/day

**Result:** Better performance, no burnout

### Resume Optimization

**A/B Test Versions:**
- Version A: Achievement-heavy
- Version B: Responsibility-heavy
Test which gets more callbacks

**Keyword Injection:**
```bash
claude
> "Extract top 20 keywords from this JD.
   Make sure they appear in my resume (in context)."
Result: 30% better ATS scores
```

**ATS-Friendly Format:**
- Plain text or simple PDF
- No images, no colors, no fancy fonts
- Simple bullets, standard fonts

---

## Ready-to-Use Workflow Templates

### Template 1: Daily Morning Standup (10 min)

```bash
claude
> "My situation today:
   - Applications sent so far: [X]
   - Interviews scheduled: [Y]
   - Days until first interview: [Z]
   
   Create a personalized daily plan for:
   1. Job applications (companies to scan)
   2. Interview prep (topics to study, YouTube links)
   3. Resume work (any to generate?)
   4. Time allocation (morning/afternoon/evening)
   5. Priorities (what matters most?)"
```

### Template 2: Weekly Job Application Blitz (3 days)

**Day 1: Scan & Evaluate (1 hour)**
```bash
npm run scan-portals -- --archetype "Your Target" \
  --companies "Company1,Company2,Company3"

claude
> "I found 12 jobs. Evaluate all of them.
   Show only those scoring 4.0+.
   Rank by salary, then growth opportunity."
```

**Day 2: Generate Resumes & Apply (2 hours)**
```bash
npm run generate-resume -- job_id_1
npm run generate-resume -- job_id_2
npm run generate-resume -- job_id_3
# Then manually apply on portals (15-20 mins each)
```

**Day 3: Track & Plan (30 mins)**
```bash
claude
> "I applied to 5 jobs. Update my tracking.
   When should I follow up?
   Which companies to prioritize for prep?"
```

### Template 3: Interview Prep Schedule (4 Weeks)

Print and check off daily:

**Week 1: Fundamentals**
- Monday: Concept intro (1hr) + LeetCode easy (1hr)
- Tuesday: Review + medium problems (1.5hrs)
- Wednesday: Deep dive (1.5hrs) + system design (1hr)
- Thursday: Practice problems (2hrs) + behavioral (30min)
- Friday: Weak areas (1.5hrs) + mock interview (1hr)

**Week 2: Medium Problems & Case Studies**
- Mon-Wed: LeetCode medium (4-5/day, 3hrs each) + design (2hrs)
- Thursday: Interview pace practice (3hrs)
- Friday: Mock interview round 2 (1.5hrs)

**Week 3: Advanced & Specialized**
- Daily: Advanced problem (1-2hrs) + company deep dive (1hr) + behavioral (30min) + YouTube (1hr)

**Week 4: Final Polish**
- Mon-Wed: 2 mock interviews/day (3hrs each) + weak areas
- Thursday: Final mock (2hrs) + relaxation
- Fri-Sun: Light review only + rest

**Generate custom schedule:**
```bash
npm run prepare-interview -- "job_description.txt"

claude
> "Adjust this schedule for my [X] day interview.
   Include specific YouTube videos for each day."
```

### Template 4: Batch Resume Generation

```bash
# Create jobs.txt with job IDs, then:
for job_id in $(cat jobs.txt); do
  npm run generate-resume -- $job_id
done

# Organize results:
mv data/resumes/resume_123.pdf data/resumes/Company1_Backend.pdf
```

### Template 5: Interview Tracking Spreadsheet

Keep in Excel/Google Sheets:
```
| Date | Company | Position | Score | Applied | Called | Date | Status | Prep | Outcome |
|------|---------|----------|-------|---------|--------|------|--------|------|---------|
| Apr18| Flipkart| Backend  | 4.5   | ✓       | ✓      |Apr22 |Round1  | 80%  | Pending |
```

Update with Claude:
```bash
claude
> "I got interview calls from Flipkart (Apr 22) and Amazon (Apr 25).
   Show me ranked list by urgency.
   Create prep plan for each upcoming interview."
```

### Template 6: Mock Interview Session (1 hour)

```bash
claude
> "Conduct a mock system design interview for [Company].

Rules:
1. Give me a design problem
2. I solve it (30 mins)
3. You ask follow-ups (15 mins)
4. Give feedback (15 mins)

Design a: [system]
Company: [target]
Level: [engineer level]
Start!"
```

**Alternative - Coding Round:**
```bash
claude
> "LeetCode-style mock (45 mins).
   Problem: Medium difficulty, [topic]
   Time limit: 25 minutes
   Then review my code and optimize."
```

### Template 7: Weak Area Deep Dive

```bash
claude
> "I'm weak in [Topic].
   Create a 3-day intensive course:

   1. KEY CONCEPTS (how they connect, why they matter)
   2. YOUTUBE RESOURCES (best tutorials with links)
   3. PROBLEMS (5 easy, 5 medium, 2 hard)
   4. PROJECT (build something using [topic])
   5. ASSESSMENT (quiz me at the end)

   Let's start!"
```

### Template 8: End of Day Review (15 min)

```bash
claude
> "Daily review:

   Today I studied: [what]
   Problems solved: [how many]
   YouTube watched: [hours]
   Mock interviews: [count]

   Based on this:
   1. Am I on track? (Y/N)
   2. Topics needing more work?
   3. What went well?
   4. What to adjust tomorrow?
   5. Prep score: X/10
   6. Confidence: X/10

   Give me honest feedback + tomorrow's priorities."
```

### Template 9: Pre-Interview Checklist (Day Before)

```
□ Reviewed company's tech stack
□ Watched 1 recent interview from company
□ Solved 3 similar LeetCode problems
□ Did 1 mock interview
□ Reviewed top 3 focus areas
□ Prepared 3 questions for interviewer
□ Fixed laptop issues, tested camera/mic
□ Good dinner + 8 hours sleep planned
□ Outfit ready
```

### Template 10: Interview Day Checklist (2 Hours Before)

```
□ Review your strongest project (2 mins)
□ Quick mock problem (5 mins)
□ Check camera/mic (5 mins)
□ Have water nearby
□ Stretch and warm up
□ Bathroom break
□ Clean background
□ Good lighting
```

---

## Need Help?

```
1. Check CLAUDE.md for feature docs
2. Review README.md for command reference
3. Run: npm run --help
4. Ask Claude Code: "Help! [Your issue]"
```

**Built with ❤️ for efficient job searching**
