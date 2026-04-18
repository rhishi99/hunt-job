# Workflow Templates - Copy & Customize

## Template 1: Daily Morning Standup

**Time: 10 minutes**

Save as `./scripts/daily-standup.txt`:

```
Good morning! 

My situation today:
- Applications sent so far: [X]
- Interviews scheduled: [Y]
- Days until first interview: [Z]

Create a personalized daily plan that includes:

1. JOB APPLICATIONS
   - Company/position to scan
   - Number of jobs to evaluate
   - Time allocation

2. INTERVIEW PREP
   - Topics to study (based on nearest interview)
   - YouTube resources with watch time
   - LeetCode problems to solve
   - Mock interview? (Y/N)

3. RESUME WORK
   - Any resumes to generate?
   - Any reviews needed?

4. TIME ALLOCATION
   - Morning (9am-12pm): [topic]
   - Afternoon (1pm-5pm): [topic]
   - Evening (6pm-8pm): [topic]

5. PRIORITY RANKING
   - What matters most today?

Format as actionable checklist.
```

**Use with Claude Code:**

```bash
claude
> $(cat ./scripts/daily-standup.txt)
```

---

## Template 2: Weekly Job Application Blitz

**Time: Spread over 3 days**

### Day 1: Scan & Evaluate (1 hour)

```bash
# Scan 3 companies
npm run scan-portals -- --archetype "Your Target" \
  --companies "Company1,Company2,Company3"

# Evaluate each (Claude does in parallel)
claude
> "I found 12 jobs. Evaluate all of them.
   Show only those scoring 4.0+.
   Rank by salary, then by growth opportunity.
   Format as table with links."
```

### Day 2: Generate Resumes & Apply (2 hours)

```bash
# For each top job:
npm run generate-resume -- job_id_1
npm run generate-resume -- job_id_2
npm run generate-resume -- job_id_3

# Then manually apply on company portals
# (15-20 mins per company)
```

### Day 3: Track & Plan (30 mins)

```bash
# Update applications tracking
# Check if any responses
# Update follow-up dates

claude
> "I applied to 5 jobs. Update my tracking.
   When should I follow up?
   Which companies to prioritize for interview prep?"
```

---

## Template 3: Interview Prep Schedule (4 Weeks)

**Print this out and check off daily:**

### Week 1: Fundamentals
```
□ Monday
  - Watch: Concept intro video (1 hr)
  - LeetCode: 5 easy problems (1 hr)
  - Time: 2 hours

□ Tuesday  
  - Review: Concepts from Monday (30 mins)
  - LeetCode: 3 medium problems (1 hr)
  - Time: 1.5 hours

□ Wednesday
  - Deep dive: Topic 2 (1.5 hrs)
  - System design basics (1 hr)
  - Time: 2.5 hours

□ Thursday
  - Practice problems (2 hrs)
  - Behavioral Q&A prep (30 mins)
  - Time: 2.5 hours

□ Friday
  - Review weak areas (1.5 hrs)
  - Mock interview Round 1 (1 hr)
  - Time: 2.5 hours

□ Weekend
  - Rest and review notes
```

### Week 2: Medium Problems & Case Studies
```
□ Monday - Wednesday
  - LeetCode Medium: 4-5 problems/day (3 hrs each)
  - System design case study: 2 hours
  - Total: 5 hours/day

□ Thursday
  - Practice interview pace: Solve in 20 mins
  - Focus on speed and accuracy
  - Total: 3 hours

□ Friday
  - Mock interview Round 2 (1.5 hrs)
  - Review feedback
  - Rest

□ Weekend
  - Light review only
  - Behavioral questions practice
```

### Week 3: Advanced & Specialized Topics
```
□ Daily
  - Advanced problem: 1-2 hours
  - Company-specific deep dive: 1 hour
  - Behavioral mock: 30 mins
  - YouTube advanced tutorial: 1 hour
  - Total: 3.5 hours/day
```

### Week 4: Final Polish
```
□ Monday-Wednesday
  - 2 mock interviews/day
  - Weak area drilling
  - Practice at interview speed
  - Total: 3 hours/day

□ Thursday
  - Final mock (full 2 hours)
  - Relaxation techniques
  - Good sleep

□ Friday-Sunday
  - Light review only
  - Confidence building
  - Rest well!
```

**Usage:**
```bash
# Generate this schedule from job description:
npm run prepare-interview -- "job_description.txt"

# Get custom schedule:
claude
> "I have an interview in [X] days.
   Adjust this schedule to fit.
   Include specific YouTube videos for each day."
```

---

## Template 4: Batch Resume Generation

**Generate 5+ resumes at once:**

```bash
# Create jobs.txt with job IDs:
# job_123
# job_456
# job_789
# job_101
# job_202

# Run batch generation
for job_id in $(cat jobs.txt); do
  echo "Generating resume for $job_id..."
  npm run generate-resume -- $job_id
  echo "✓ Done!"
  sleep 2
done

# All resumes in data/resumes/

# Then organize:
mv data/resumes/resume_123.pdf data/resumes/Company1_Backend.pdf
mv data/resumes/resume_456.pdf data/resumes/Company2_DataEng.pdf
# etc
```

---

## Template 5: Interview Tracking Spreadsheet

**Keep in Excel or Google Sheets:**

```
| Date | Company | Position | Score | Applied | Call | Date | Status | Prep Done? | Outcome |
|------|---------|----------|-------|---------|------|------|--------|-----------|---------|
| Apr18| Flipkart| Backend  | 4.5   | ✓      | ✓   | Apr22| Round1 | 80%      | Pending |
| Apr18| Google  | SDE      | 4.2   | ✓      | ✗   |      | Waiting|  0%      | Applied |
| Apr19| Amazon  | Backend  | 4.0   | ✓      | ✓   | Apr25| Coding| 50%      | Pending |
```

**Update tracking with Claude:**

```bash
claude
> "Update my application status:
   - Flipkart: Got interview call for Apr 22
   - Google: No response yet, mark for follow-up
   - Amazon: Interview on April 25
   
   Show me ranked list by urgency.
   Create prep plan for each upcoming interview."
```

---

## Template 6: Mock Interview Session

**Allocate 1 hour:**

```bash
claude
> "Conduct a mock system design interview for my [Company] interview.

Rules:
1. Give me a design problem
2. I'll solve it (30 mins)
3. You'll ask follow-up questions (15 mins)
4. Give feedback (15 mins)

Design a: [system to design]
Company: [target company]
Level: [engineer level]

Start!"
```

**Alternative - Coding Round:**

```bash
claude
> "LeetCode-style mock interview (45 mins).

Problem: Medium difficulty
Topic: [Arrays/Trees/Graphs/DP]
Time limit: 25 minutes
Then review my code and optimize.

Go!"
```

---

## Template 7: Weak Area Deep Dive

**For topics you're struggling with:**

```bash
claude
> "I'm weak in [Topic].

Create a 3-day intensive course including:

1. CONCEPTS
   - Key concepts I need to know
   - How they connect
   - Why they matter

2. YOUTUBE RESOURCES
   - Best tutorial (with link)
   - Best practice videos
   - Recommended channels

3. PROBLEMS
   - 5 easy problems to start
   - 5 medium problems
   - 2 hard problems (stretch)

4. PROJECT
   - Build something using [topic]
   - Real-world application

5. ASSESSMENT
   - Quiz me at the end
   - Show proficiency score

Let's start with concepts!"
```

---

## Template 8: Application Tracking Script

**Automate application updates:**

Create `scripts/track-application.sh`:

```bash
#!/bin/bash

# Usage: ./track-application.sh "Company" "Role" "URL"

COMPANY=$1
ROLE=$2
URL=$3
DATE=$(date +%Y-%m-%d)

# Add to applications.json
cat >> data/applications.json << EOF
{
  "applicationId": "app_$(date +%s)",
  "company": "$COMPANY",
  "position": "$ROLE",
  "url": "$URL",
  "appliedDate": "$DATE",
  "status": "Applied",
  "followUpDate": "$(date -d '+14 days' +%Y-%m-%d)",
  "notes": ""
}
EOF

echo "✓ Tracked: $COMPANY - $ROLE"
```

**Use it:**

```bash
./scripts/track-application.sh "Flipkart" "Backend Engineer" "https://..."
./scripts/track-application.sh "Google" "SDE-3" "https://..."
```

---

## Template 9: Daily Study Session

**60-90 minute focused study:**

```
9:00-9:30  → YouTube concept (30 mins)
9:30-10:00 → Take notes (30 mins)
10:00-10:30→ Solve problem implementing concept
10:30-10:45→ Claude quiz on concept
10:45-11:00→ Rest / Hydrate

OR

9:00-9:45  → LeetCode problem (45 mins)
9:45-10:00 → Optimize solution
10:00-10:15→ Code review with Claude
10:15-11:00→ Similar problem for practice

OR

9:00-10:00 → System design problem (60 mins)
10:00-10:45→ Claude feedback + improvements
```

**Generate today's session:**

```bash
claude
> "Generate a 90-minute focused study session for [Topic].

Include:
- Specific YouTube videos with timestamps
- Problem to solve
- Time for each activity
- Breaks

Make it practical and actionable."
```

---

## Template 10: End of Day Review

**15 minutes before sleep:**

```bash
claude
> "Daily review:

Today I studied: [what]
Problems solved: [how many]
YouTube watched: [hours]
Mock interviews: [count]

Based on this:
1. Am I on track for my interview? (Y/N)
2. What topics need more work?
3. What went well today?
4. What should I adjust tomorrow?
5. Current prep score: X/10
6. Confidence level: X/10

Give me honest feedback and tomorrow's priorities."
```

---

## How to Use These Templates

1. **Copy relevant template**
2. **Customize with your details**
3. **Save in repo** (e.g., `scripts/my-template.txt`)
4. **Run with Claude Code** when needed
5. **Track results** in your tracking spreadsheet

**Pro Tip:** Combine multiple templates in single Claude Code session for maximum efficiency!

---

**Templates save time. Consistency wins jobs. 🚀**
