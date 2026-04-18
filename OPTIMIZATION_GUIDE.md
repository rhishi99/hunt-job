# Optimization Guide - Advanced Tips & Tricks

## Token Optimization

### Strategy 1: Batch Similar Requests

**❌ Inefficient (10 separate prompts):**
```
Evaluate job 1
Evaluate job 2
Evaluate job 3
...
What should I focus on?
```
**Cost:** 40K tokens

**✅ Efficient (1 smart prompt):**
```
Evaluate these 10 jobs and show me:
- Only scores >= 4.0
- Ranked by salary
- Top 3 with resumes to generate
- Interview prep priorities
```
**Cost:** 15K tokens (60% savings!)

### Strategy 2: Use Haiku for Filtering, Sonnet for Polish

```bash
# Fast filtering (cheap)
SCANNING_MODEL=claude-3-5-haiku-20241022 npm run scan-portals -- ...

# High quality output (reliable)  
CLAUDE_MODEL=claude-3-5-sonnet-20241022 npm run generate-resume -- ...
```

**Token usage:**
- Haiku: 1/3 cost of Sonnet
- Use for: Initial scans, filtering, bulk operations
- Use Sonnet for: Final decisions, resumes, important evals

### Strategy 3: Cache Frequently Used Data

**Create a reference file:**

```bash
# Create: data/reference/my-profile.md
echo "My strongest skills: System Design, Backend, Cloud"
echo "Weakest areas: Frontend, Mobile"
echo "Interview style: Detailed, math-heavy"
```

**Then reference it:**
```
"Evaluate this job based on my profile (see data/reference/my-profile.md).
Also suggest interview prep focus areas."
```

Saves re-explaining your background!

---

## Speed Optimization

### Speed Hack 1: Parallel Job Evaluations

**Instead of serial:**
```bash
npm run evaluate-job -- url1 && npm run evaluate-job -- url2 && ...
```

**Use parallel:**
```bash
# Create urls.txt
# Then in Claude:
claude
> "I have these 10 job URLs. Evaluate all in parallel.
   Show me the scores, top 5 to apply to."

# Claude processes simultaneously!
```

**Time saved:** 10 mins on 10 jobs

### Speed Hack 2: Pre-stage Your Profile

Instead of typing during profile init:

```bash
# Create config/profile-template.yml with all your details
# Then on init, copy & customize
cp config/profile-template.yml config/profile.yml

# Edit only what changes
nano config/profile.yml
```

**Time saved:** 5 mins per profile update

### Speed Hack 3: Keyboard Shortcuts for Claude Code

**Create aliases:**

```bash
# Add to ~/.bashrc or ~/.zshrc

alias ev='npm run evaluate-job --'
alias gen='npm run generate-resume --'
alias prep='npm run prepare-interview --'
alias scan='npm run scan-portals --'

# Usage:
ev "https://..."
gen job_123
prep "job description"
scan --archetype "Backend"
```

**Time saved:** 1-2 secs per command * 50+ commands = 1-2 mins/day

### Speed Hack 4: Batch Resume Generation

```bash
# Instead of one at a time
for id in job_1 job_2 job_3; do
  npm run generate-resume -- $id &
done
wait
```

**Time saved:** 5 mins on 5 resumes (parallel > serial)

---

## Quality Optimization

### Quality Hack 1: Specific, Detailed Feedback to Claude

**❌ Generic:**
```
"Review my resume"
```

**✅ Specific:**
```
"Review my resume against the Flipkart backend job description.
Check:
1. Are system design keywords prominent?
2. Is it ATS-friendly (no images, colors)?
3. Are bullet points metric-focused?
4. Does it match their required tech stack?

If issues, suggest specific rewording."
```

**Quality improvement:** 50% better feedback

### Quality Hack 2: Iterative Refinement

**Loop:**
```
1. Generate resume
2. Claude reviews
3. You provide feedback
4. Claude revises
5. Repeat until satisfied
```

**Instead of:**
```
1. Generate once
2. Submit as-is
```

**Quality improvement:** 100% better final output

### Quality Hack 3: Reference Real Job Descriptions

```bash
# Instead of describing the job:
claude
> "Create interview prep for this job description.
   [Paste FULL job description here]"

# Much better than summary!
```

**Why:** Claude sees real requirements, not your interpretation

---

## Application Velocity Optimization

### Target: 10 Applications/Week

**Daily Schedule:**
- Monday: Scan + Evaluate (6 jobs)
- Tuesday: Generate Resumes (3 jobs) + Apply  
- Wednesday: Generate Resumes (3 jobs) + Apply
- Thursday-Friday: Interview prep + Follow-ups

**Time allocation:**
- Scanning: 15 mins
- Evaluation: 15 mins (1-2 min per job with Claude)
- Resume generation: 10 mins (parallel)
- Application: 30 mins (15 min per job)
- Interview prep: 1-2 hours

**Total:** 2-3 hours/day for 10 applications/week

### Optimization Tips:

1. **Batch evaluations:**
   ```
   Claude: "Evaluate all 6 jobs. Show scores ranked."
   ```
   Instead of 6 separate commands

2. **Parallel resume generation:**
   ```bash
   for id in {1..5}; do npm run generate-resume -- job_$id & done
   ```

3. **Template resumes:**
   - Keep 2-3 base versions
   - Minimal customization needed
   - 5 mins per resume instead of 15

4. **Group applications:**
   - Apply to all 5 on same day
   - Better tracking
   - Easier follow-ups

---

## Interview Prep Optimization

### 7-Day Crash Course (Instead of 4 weeks)

**For interview in 1 week:**

```
Day 1: Fundamentals + 2 YouTube tutorials (3 hrs)
Day 2: DSA problems (3 hrs, 6 problems)  
Day 3: System design deep dive (4 hrs, 2 case studies)
Day 4: Advanced topics + LeetCode (3 hrs)
Day 5: Mock interviews (2x2 hrs = 4 hrs)
Day 6: Weak areas drilling (2 hrs) + Behavioral (1 hr)
Day 7: Rest + Light review
```

**Total: 20 hours vs 40 hours**

**Strategy:**
- Skip topics you know well
- Focus on top 5 areas only
- Do 2-3 mock interviews (not 10)
- Heavy YouTube, light theory

### 3-Day Intensive (If truly desperate)

**For interview in 3 days:**

```bash
claude
> "I have 3 days until my interview.
   Create a crash course focusing on:
   - Top 3 most likely topics
   - 10 must-solve problems
   - 2 mock interviews
   
   Total: 6 hours/day for 3 days
   Focus only on essentials."
```

**What to drop:**
- Advanced topics
- Weak company culture fit
- Behavioral deep dives
- Theory lectures

**What to focus:**
- Real problems from their interviews
- System design patterns
- Quick mock interviews

---

## Data & Analytics Optimization

### Build Your Own Dashboard

**Track metrics:**

```bash
# Weekly snapshot:
wc -l data/evaluated-jobs.json        # Total jobs evaluated
grep -c '"status":"Applied"' data/applications.json  # Total applied
grep -c '"status":"Interview"' data/applications.json # Interviews got
```

**Create tracking file:**

```
Week 1: 6 applied, 0 interviews, 4.1 avg score
Week 2: 8 applied, 1 interview, 4.2 avg score
Week 3: 7 applied, 2 interviews, 4.0 avg score
Week 4: 5 applied, 2 interviews, 4.4 avg score
```

**Ask Claude:**
```
"Based on my application history, am I on track?
What's my success rate?
How should I adjust my strategy?"
```

---

## Interview Success Optimization

### Pre-Interview Checklist (Day Before)

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

### Interview Day Checklist (2 Hours Before)

```
□ Review your strongest project (2 mins)
□ Quick mock problem (5 mins)
□ Check camera/mic quality (5 mins)
□ Have water nearby
□ Warm up - do stretches
□ Bathroom break
□ Background clean
□ Good lighting on face
```

### Post-Interview Action

```bash
claude
> "Mock interview post-mortem:

How did it go? [Your honest assessment]
Topics I struggled with: [X, Y, Z]
Things I did well: [A, B, C]

For next interview:
1. What to focus on
2. What to avoid
3. Confidence building areas"
```

---

## Resume Optimization

### A/B Testing Versions

Create 2 versions:

**Version A:** Achievement-heavy
```
"Led 8-engineer team designing microservices that reduced latency by 40%"
```

**Version B:** Responsibility-heavy
```
"Responsible for backend team's code quality and performance optimization"
```

**Test both** on similar companies, see which gets more callbacks.

### Keyword Optimization

```bash
claude
> "Extract the top 20 keywords from this job description.
   Now, make sure they appear in my resume (in context).
   Update my resume to include all of them naturally."
```

**Result:** 30% better ATS scores

### Format Optimization

**ATS-Friendly Format:**
```
- Plain text or simple PDF
- No images, no colors, no fancy fonts
- Simple bullet points
- Standard fonts: Arial, Calibri, Times New Roman
- No tables or columns
```

**Quality Check:**
```bash
claude
> "Is this PDF ATS-friendly?
   Will recruiters' software parse it correctly?
   Any formatting issues?"
```

---

## Time Management Matrix

| Activity | Frequency | Time | Priority | Cloud? |
|----------|-----------|------|----------|--------|
| Job scanning | 2x/week | 15 min | High | Yes |
| Job evaluation | Daily | 15 min | High | Yes |
| Resume generation | As needed | 10 min | High | Yes |
| Interview prep | Daily | 2 hrs | High | Yes |
| Mock interviews | 3x/week | 1.5 hrs | Medium | Yes |
| Behavioral prep | 2x/week | 30 min | Medium | No |
| Application tracking | Daily | 5 min | Low | No |
| Follow-ups | Weekly | 20 min | Medium | No |

**Total per week: 15-20 hours focused effort**

---

## Cost Optimization

**Monthly budget target:** < $1/month in API calls

**How:**
- Scan with Haiku (cheaper)
- Batch requests (fewer calls)
- Reuse stored evaluations
- Cache your profile

**vs Professional services:**
- Resume writers: $500+
- Interview coaches: $200/session
- Job boards: $100+/month

**Career-Ops:** $0.30/month 💰

---

## Learning Velocity Optimization

### YouTube Watching Strategy

**Don't watch passively!**

```
1. Preview: Skim video (5 mins)
2. Watch: Active watch at normal speed (20 mins)
3. Pause: Pause frequently, take notes (5 mins)
4. Apply: Code along immediately (10 mins)
5. Review: Watch sections again if needed (5 mins)
6. Test: Solve practice problem (10 mins)

Total: 55 mins, but deep learning!
vs 1 hour passive = shallow learning
```

### Concept Building

**Instead of jumping around:**
1. Pick 1 topic deep (e.g., Distributed Systems)
2. Master the core concept (1 YouTube video)
3. Understand practical application (case study)
4. Practice implementation (coding)
5. Teach it to someone else (in interview!)

**Then:** Move to next topic

---

## Sustainable Preparation

### Burnout Prevention

**Don't do:**
- 8+ hours/day study (unsustainable)
- 100+ LeetCode problems (diminishing returns)
- 24/7 interview prep (mental fatigue)

**Do:**
- 2-3 focused hours/day
- 20-30 quality problems
- 3-4 hours rest/day
- Maintain sleep schedule
- Exercise 30 mins/day

**Result:** Better performance, no burnout

### Consistency Over Intensity

**Better:** 2 hrs/day for 30 days = 60 hours
**Worse:** 10 hrs/day for 6 days = 60 hours

Why? Spaced learning > massed learning (psychology)

---

## Scale Optimization: Multiple Offers

**To get multiple offers:**

1. **Apply broadly:** 20-30 applications (week 1-2)
2. **Get 3-4 interviews:** Expected ~15% callback rate
3. **Prep intensively:** 2-3 weeks per interview
4. **Negotiate together:** Get offers, then negotiate

**Timeline:** 4-6 weeks total

**Key:** Quality applications (score 4.0+) → Higher callback rate → More options

---

## Final Optimization Metrics

**Track these weekly:**

```
Applications sent:        [target: 10/week]
Evaluation avg score:     [target: 4.0+]
Interview callbacks:      [target: 15%+ of applications]
Prep completion:          [target: 80%+]
Mock interview score:     [target: 7+/10]
Actual interview score:   [target: 8+/10]
```

**If not hitting targets, optimize:**
- Lower score threshold? (More volume)
- Better resumes? (Higher quality)
- More interview prep? (Better performance)
- Different companies? (Better fit)

---

**Master these optimizations. Win faster. 🎯**

**Remember: Speed + Quality + Consistency = Success**
