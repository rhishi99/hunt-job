# Claude Code Integration Guide

## Quick Start: Using Claude Code with Career-Ops

### Installation (2 mins)

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Authenticate with Anthropic
claude login

# Navigate to Career-Ops
cd ~/projects/hunt-job

# Start Claude Code session
claude
```

You should see a prompt like:
```
You are Claude, running in Claude Code mode...
Type your commands below:
```

---

## Core Workflows with Claude Code

### Workflow 1: Single Job Evaluation & Resume Generation

**Scenario:** You found an interesting job posting

**Claude Code Commands:**

```
User: "I want to evaluate a job posting and generate a resume if it's a good match.
       Job URL: https://careers.flipkart.com/jobs/backend-engineer

       My profile: Backend Engineer with 5 years experience, looking for roles 
       paying 18-25 LPA with focus on system design"

Claude: Runs npm run evaluate-job -- "https://careers.flipkart.com/jobs/backend-engineer"

Output: 
Score: 4.2/5.0 ✅ (Apply Recommended)
- Salary: 4.5/5 (18-22 LPA range matches)
- Tech: 4.0/5 (Java, Golang, Postgres required - you know these)
- Growth: 4.5/5 (Leadership path available)

User: "Great! Generate a tailored resume for this role."

Claude: Runs npm run generate-resume -- job_<id>

Output: 
✅ Resume generated: data/resumes/resume_1234567890.pdf
Keywords extracted: ['System Design', 'Microservices', 'Java', 'Golang', ...]

User: "Show me what changed in the resume - what keywords did you highlight?"

Claude: Shows the modified resume with changes explained
```

---

### Workflow 2: Batch Job Scanning & Evaluation

**Scenario:** You want to apply to 10 jobs this week

**Claude Code Command:**

```
User: "Find me 10 backend engineer roles paying 18+ LPA at these companies:
       Flipkart, Google India, Amazon India, Microsoft India
       
       Then evaluate each and show me only those scoring 4.0+
       Rank by salary, then by growth opportunity"

Claude: 
1. Runs scan-portals for all 4 companies
2. Returns 15 matching jobs
3. Evaluates each
4. Filters for score >= 4.0 → 12 jobs qualify
5. Ranks by criteria → Top 10 shown

Output:
Rank  Company          Role                 Score  Salary(LPA)  Growth  URL
1.    Flipkart         Senior Backend       4.5    20-22       Excellent  ...
2.    Google India     SWE-3               4.4    22-25       Excellent  ...
3.    Amazon India     Senior SDE          4.3    19-21       Very Good  ...
...

User: "I'll apply to top 5. Generate tailored resumes for each."

Claude: Creates 5 customized resumes, one for each job
```

---

### Workflow 3: Interview Prep with Study Schedule

**Scenario:** You have an interview in 10 days

**Claude Code Command:**

```
User: "I have an interview at Flipkart for Backend Engineer role in 10 days.
       Create a crash course preparation plan with:
       1. Key topics to master
       2. YouTube resources with links
       3. LeetCode problems to solve
       4. Mock interview questions
       5. Daily study schedule"

Claude: Runs npm run prepare-interview -- "Backend Engineer at Flipkart..."

Output:
Interview Prep Plan for Flipkart Backend Engineer

CRITICAL FOCUS AREAS:
1. System Design (20% of time)
   - Design Notification System (scale to 1M users)
   - Design E-commerce Cart System
   - YouTube: Gaurav Sen - System Design Interview Questions
   Link: https://www.youtube.com/results?search_query=Gaurav+Sen+system+design

2. DSA - Arrays, Trees, Graphs (30% of time)
   - LeetCode: Median of Two Sorted Arrays
   - LeetCode: LRU Cache
   - YouTube: Abdul Bari - DSA Problems
   Link: https://www.youtube.com/results?search_query=Abdul+Bari+DSA

3. Database Design (15% of time)
   - SQL Optimization, Indexing
   - NoSQL vs SQL trade-offs
   - YouTube: Hussein Nasser - Database Design
   Link: https://www.youtube.com/results?search_query=Hussein+Nasser+database

4. Microservices Architecture (15% of time)
   - Service-oriented design
   - API Gateway patterns
   - YouTube: Gaurav Sen - Microservices
   Link: https://www.youtube.com/results?search_query=microservices+interview

5. Behavioral Prep (10% of time)
   - Tell me about your biggest achievement
   - How do you handle conflict?
   - Describe a system you designed

6. Coding Patterns (10% of time)
   - Sorting algorithms
   - Tree traversals
   - Graph problems

10-DAY CRASH COURSE SCHEDULE:

Day 1-2: Fundamentals
- Morning: System Design Basics (2 hrs)
  YouTube: Gaurav Sen "System Design for Interviews"
- Afternoon: DSA Review (2 hrs)
  LeetCode: Solve 5 Easy problems
- Evening: Mock Behavioral (30 mins)

Day 3-4: System Design Deep Dive
- Solve 2 real case studies
- Design Twitter-like service
- Design Facebook feed system

Day 5-7: LeetCode Grind
- Medium level problems: 3-4 per day
- Focus on Arrays, Trees, Strings
- Time constraint: Solve in 20-25 minutes

Day 8: Database & Advanced Topics
- SQL optimization patterns
- Caching strategies
- Load balancing

Day 9: Full Mock Interview
- 45 mins coding problem
- 30 mins system design
- 15 mins behavioral

Day 10: Rest & Review
- Review weak areas
- Final mock if needed
- Get good sleep!

User: "Create a detailed daily schedule with specific problems and YouTube times"

Claude: Generates hour-by-hour breakdown:
9:00-10:30 AM: Watch Gaurav Sen - System Design (with timestamps)
10:30-12:00 PM: Implement design in code
1:00-2:30 PM: LeetCode - Solve 2 Medium problems
... etc
```

---

### Workflow 4: Interactive Learning Session

**Scenario:** You want to master a specific topic

**Claude Code Command:**

```
User: "I need to learn System Design for my interview in 2 weeks.
       Create an interactive learning session where you:
       1. Explain key concepts
       2. Show YouTube resources
       3. Ask me practice questions
       4. Review my answers
       5. Suggest weak areas"

Claude: Starts interactive session

Claude: "Let's start! First concept: Scalability.

What is scalability in system design? (Try to explain in 2 minutes)
I'll give you feedback, then show you resources if needed."

User: "Scalability means the system can handle increasing load..."

Claude: "Good start! Here's more detail you should know:

Vertical Scaling: Adding more power to existing machine
Horizontal Scaling: Adding more machines to distribute load

Key differences:
- Horizontal is more cost-effective at scale
- Horizontal has complexity (load balancing, data consistency)
- Vertical has hardware limits

Watch this for deeper understanding:
YouTube: https://www.youtube.com/results?search_query=Gaurav+Sen+scalability

Now, here's your practice question:

Design a system that can handle:
- 10 million daily users
- 100k concurrent users
- 50 million requests per day

What scalability patterns would you use?"

User: "I would use horizontal scaling with load balancers..."

Claude: "Excellent! Let me drill deeper...
But wait - what about data consistency? 
How would you handle that across multiple servers?"

[Interactive session continues...]
```

---

### Workflow 5: Resume Customization & Feedback

**Scenario:** Generated resume exists, need refinements

**Claude Code Command:**

```
User: "Review the generated resume for the Google Backend Engineer role.
       Check:
       1. Are all keywords from job description included?
       2. Is it ATS-friendly (right formatting, no images)?
       3. Are bullet points achievement-focused?
       4. Should I change anything?"

Claude: Analyzes resume_<id>.pdf against job_description

Output:
✅ KEYWORD ANALYSIS:
Job Required: System Design, Java, Cloud, API, Microservices, Leadership
Resume Has: ✓ System Design, ✓ Java, ✓ Cloud, ✗ API, ✗ Microservices
Missing: Add "API Design" and "Microservices Architecture" to experience

⚠️ FORMATTING ISSUES:
- Line too long in section 2 (> 90 chars)
- Font consistency: Mix of 10pt and 11pt
- Color detected - use black only for ATS

✅ ACHIEVEMENT FOCUS:
Good: "Led team of 8 engineers..."
Weak: "Responsible for bug fixes"
Better: "Reduced bug rate by 40% through systematic code review"

RECOMMENDED CHANGES:
1. Add quantifiable metrics to 3 more bullets
2. Include "API" and "Microservices" explicitly
3. Fix formatting on page 2
4. Replace weak verb "Responsible" with action verbs

User: "Make these changes for me"

Claude: Updates the resume with all recommendations
```

---

## Natural Language Commands Reference

### Job Evaluation
```
"Evaluate this job: [URL]"
"Score this job against my profile"
"Is this role aligned with my 5-year plan?"
"Compare these 3 jobs for me: [URLs]"
```

### Resume Generation
```
"Generate a resume for this job"
"Make the resume more ATS-friendly"
"Highlight system design experience"
"Add quantifiable metrics to bullets"
```

### Job Scanning
```
"Find backend engineer roles in Bangalore"
"Scan Google and Amazon for data roles"
"Show me remote jobs >= 20 LPA"
"Which companies match my criteria?"
```

### Interview Prep
```
"Create interview prep for [job description]"
"Generate a 7-day crash course for this interview"
"Quiz me on system design"
"Mock interview - coding round"
"Explain [concept] with YouTube links"
```

### Analysis & Strategy
```
"Show me my top 5 jobs to apply to"
"Which interviews should I prioritize?"
"What topics should I study this week?"
"How's my application progress?"
"Rank my interviews by success probability"
```

---

## Advanced Claude Code Patterns

### Pattern 1: Daily Standup

Create a file `claude_standup.prompt`:
```
Good morning!

My interviews:
- Flipkart (Backend) - 5 days away
- Google (SDE) - 10 days away

My applications: 12 submitted, 2 interviews scheduled

What should I focus on today?
Create a personalized schedule including:
1. Study topics and YouTube resources
2. LeetCode problems to solve
3. Applications to submit
4. Mock interview prep
5. Time allocation
```

Run daily:
```bash
claude $(cat claude_standup.prompt)
```

### Pattern 2: Batch Job Processing

```bash
# Create job_urls.txt with URLs, one per line

for url in $(cat job_urls.txt); do
  echo "Evaluating: $url"
  npm run evaluate-job -- "$url"
done

# Then ask Claude:
# "Analyze all evaluations. Show jobs >= 4.0 ranked by score."
```

### Pattern 3: Interview Simulation

```
"Conduct a 45-minute mock system design interview.

Rules:
- I'll design a system you specify
- You'll interrupt with follow-up questions
- You'll test my understanding
- At end, give me a score 1-10 and areas to improve

System to design: [Your choice]
Company: Flipkart
Level: Senior Engineer"
```

### Pattern 4: Study Accountability

```
"I'm studying [Topic] today.

Quiz me every 30 minutes:
1. Start with explanation question
2. If I answer well, move to practical problem
3. If I struggle, explain and share YouTube resource
4. At end of day, give me a progress report"
```

---

## Token Optimization with Claude Code

### Strategy 1: Use Haiku for Initial Scans
```
# For fast, cheap initial scans:
SCANNING_MODEL=claude-3-5-haiku-20241022 npm run scan-portals -- ...

# Output: Fast job list (costs 1/3 of Sonnet)
```

### Strategy 2: Use Sonnet for Important Decisions
```
# For resume generation and interview prep:
CLAUDE_MODEL=claude-3-5-sonnet-20241022 npm run generate-resume -- ...

# Output: High quality, more reliable
```

### Strategy 3: Batch Similar Requests
```
# Instead of 10 separate queries:
"Analyze these 10 job evaluations and tell me:
1. Which 5 should I apply to
2. Interview prep priorities
3. Target salary increase
4. Timeline recommendation"

# Saves tokens by combining multiple asks
```

---

## Troubleshooting Claude Code Issues

### Session Connection Lost
```bash
# Restart Claude Code
exit  # Exit current session
claude  # Start new session
```

### Commands Not Working
```bash
# Verify API key
echo $ANTHROPIC_API_KEY

# Check if in right directory
pwd  # Should show: .../hunt-job

# Restart
exit
cd ~/projects/hunt-job
claude
```

### Output Too Long
```
"Summarize this in bullet points"
"Show me just the top 5 results"
"Give me a concise overview"
```

---

## Real-World Example: Daily Workflow with Claude Code

**9:00 AM - Start Day**
```
claude
> "Good morning! Show me my interviews and applications due this week.
   Create a daily priority list."
```

**9:30 AM - Job Scanning**
```
> "Scan Flipkart, Google, and Amazon for Backend Engineer roles.
   Evaluate all. Show only 4.0+ scores. Generate resumes for top 3."
```

**11:00 AM - Interview Prep**
```
> "Create a focused study plan for my Flipkart interview (7 days away).
   Emphasize: System Design, DSA, Database queries."
```

**2:00 PM - Mock Interview**
```
> "Conduct a 30-minute system design mock interview.
   System: E-commerce Cart for Flipkart scale.
   Rate me 1-10 at the end."
```

**4:00 PM - Resume Review**
```
> "Review my generated resume for Google role.
   Check: Keywords present, ATS-friendly, achievement-focused.
   Suggest improvements."
```

**5:00 PM - Wrap Up**
```
> "Summary: What did I accomplish today?
   What should I focus on tomorrow?
   Any interviews coming up I should know about?"
```

---

## Performance Metrics with Claude Code

After 1 week of using Claude Code + Career-Ops:

```
Applications Submitted: 12 (vs 3 without automation)
Time per application: 15 mins (vs 45 mins manual)
Resume quality feedback: 4.2/5 average
Interview callbacks: 3 (vs 0 before optimization)
Time saved per week: 4 hours
```

---

**Built for maximum efficiency. Use Claude Code to accelerate every step! 🚀**
