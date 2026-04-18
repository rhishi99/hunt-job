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
- **Anthropic API Key** - [Get free credits](https://console.anthropic.com)
- **VS Code or Terminal** - For running commands
- **(Optional) Go** - For dashboard feature

### Step 1: Clone and Install

```bash
# Navigate to your projects folder
cd ~/projects

# Clone the repository
git clone https://github.com/rhishi99/hunt-job.git
cd hunt-job

# Install dependencies
npm install

# Install Playwright for PDF generation
npx playwright install
```

### Step 2: Configure Environment Variables

```bash
# Create .env file (never commit this!)
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk_ant_your_actual_api_key_here
CLAUDE_MODEL=claude-3-5-sonnet-20241022
SCANNING_MODEL=claude-3-5-haiku-20241022
EOF

# Set in current session
export ANTHROPIC_API_KEY="sk_ant_your_actual_api_key_here"

# Verify it's set
echo $ANTHROPIC_API_KEY
```

### Step 3: Initialize Your Profile

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

### Step 4: Add Your Experience (Optional but Recommended)

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

### Step 5: Verify Setup

```bash
# Check all commands work
npm run evaluate-job -- "https://careers.flipkart.com/jobs/backend-engineer"
npm run scan-portals -- --archetype "Backend Engineer"
npm run prepare-interview -- "Job Description"

# Should see successful outputs
```

---

## Claude Code Integration

### What is Claude Code?

Claude Code is Anthropic's official CLI tool that lets you interact with Claude directly in your terminal and leverage Claude's capabilities in your workflow.

### Installation

```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Authenticate
claude login

# Verify installation
claude --version
```

### Using Claude Code with Career-Ops

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

## Need Help?

```
1. Check CLAUDE.md for feature docs
2. Review README.md for command reference
3. Run: npm run --help
4. Ask Claude Code: "Help! [Your issue]"
```

**Built with ❤️ for efficient job searching**
