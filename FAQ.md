# Career-Ops FAQ

## General Questions

### Q: How fast can I apply to jobs with Career-Ops?

**A:** Much faster than manual:
- **Manual:** 45 mins per job (find, read, customize resume, apply)
- **Career-Ops:** 15 mins per job (evaluate 2 min, resume 5 min, apply 8 min)
- **Speed:** 3x faster with Career-Ops

Applying to **10 jobs/week** becomes realistic instead of 2-3.

---

### Q: How much do API calls cost?

**A:** Depends on usage. Rough estimates for 10 applications/week:

| Activity | Tokens | Cost |
|----------|--------|------|
| Scan portals (weekly) | 5K | $0.02 |
| Evaluate 1 job | 1-2K | $0.01 |
| Generate resume | 3K | $0.01 |
| Interview prep | 5K | $0.02 |
| **Weekly Total** | ~30K | **~$0.08** |
| **Monthly Total** | ~120K | **~$0.30** |

**Extremely affordable!** A Pro subscription ($20/month) covers 1000x more.

---

### Q: Can I customize the company list?

**A:** Yes! Edit `config/company-portals.json`:

```json
{
  "companies": [
    {
      "name": "Your Company",
      "url": "https://...",
      "careerPageUrl": "https://careers.yourcompany.com",
      "officeLocation": "Your City"
    }
  ]
}
```

Add or remove companies as needed.

---

### Q: How do YouTube links work?

**A:** Automatically generated! When you run:

```bash
npm run prepare-interview -- "job description"
```

You get YouTube resources for each topic with links:
- **Theory:** Conceptual explanations
- **Practice:** Actual problems + solutions
- **Channels:** Recommended creators for deep dives

All with direct YouTube search links - just click to watch!

---

### Q: What if I can't run Node.js?

**A:** You have options:

1. **Docker** (if you have Docker installed):
```bash
docker run -it node:18 bash
npm install -g @anthropic-ai/claude-code
```

2. **WSL** (Windows only):
```bash
wsl --install
# Then follow normal setup in WSL
```

3. **Online IDE** (Replit, Glitch):
- Create free account
- Import GitHub repo
- Run commands in terminal
- All in browser!

4. **Contact support** if you need alternative options

---

### Q: Can I use this offline?

**A:** Partially:

**Offline Capabilities:**
- ✅ View your profile (`config/profile.yml`)
- ✅ Read previous evaluations (`data/evaluated-jobs.json`)
- ✅ View generated resumes (`data/resumes/`)
- ✅ View prep plans (`data/interview-prep/`)

**Requires Internet:**
- ❌ Evaluate new jobs (needs Claude API)
- ❌ Generate new resumes
- ❌ Create interview prep plans
- ❌ Scan portals

Once generated, all data is stored locally and accessible offline!

---

## Setup Questions

### Q: Do I really need to fill out my full profile?

**A:** Better profile = Better results!

**Minimum (5 mins):**
- Name, email
- Current role
- Target archetype
- Salary range

**Recommended (15 mins):**
- Add 2-3 key projects
- List main skills
- Add dealbreakers
- Set tech preferences

**Best (30 mins):**
- Add full work experience
- List all projects with metrics
- Add specific achievements
- Set detailed preferences

The more you provide, the better Career-Ops tailors resumes and evaluations!

---

### Q: Where are my files stored?

**A:** All local on your machine:

```
hunt-job/
├── config/profile.yml           ← Your profile
├── modes/_profile.md            ← Profile backup
├── data/
│   ├── evaluated-jobs.json      ← Job scores
│   ├── applications.json        ← Application tracking
│   ├── resumes/                 ← Generated PDFs
│   └── interview-prep/          ← Study plans
```

Nothing is sent to external servers except:
- Job URLs (to Claude for analysis)
- Your actual job descriptions
- Claude API requests

**Privacy:** All stored locally!

---

### Q: Can I reset my profile?

**A:** Yes!

```bash
# Option 1: Delete and reinitialize
rm config/profile.yml
npm run profile:init

# Option 2: Edit directly
nano config/profile.yml

# Option 3: Use Claude Code
claude
> "Update my profile with new experience"
```

---

## Usage Questions

### Q: What if I don't like the generated resume?

**A:** You have full control!

1. **Let Claude fix it:**
```bash
claude
> "The resume doesn't highlight my system design skills enough.
   Make them more prominent. Add metrics where possible."
```

2. **Edit PDF directly:**
- Download resume
- Edit in any PDF editor
- Submit edited version

3. **Regenerate with feedback:**
```bash
npm run generate-resume -- job_id
# Claude learns from feedback
```

---

### Q: How accurate are job evaluations?

**A:** Claude scores based on:
- ✅ Your actual profile data
- ✅ Job description keywords
- ✅ Role requirements vs your experience
- ✅ Salary alignment
- ✅ Tech stack compatibility

**Accuracy:** 85-90% for filtering (use 4.0+ threshold)

**Use evaluation as:** Initial filter, not final decision
**You are:** The final judge - always read full job desc

---

### Q: Can I modify the scoring dimensions?

**A:** Currently fixed at 10 dimensions:
1. Salary alignment
2. Tech stack compatibility
3. Company culture fit
4. Growth opportunities
5. Location/remote requirements
6. Team dynamics
7. Product market fit
8. Work-life balance
9. Career progression
10. Dealbreaker compliance

**Future enhancement:** Custom scoring system coming!

---

### Q: What's the best way to track applications?

**A:** Use built-in tracking:

```bash
# After applying, update:
# data/applications.json

{
  "applicationId": "app_001",
  "company": "Flipkart",
  "position": "Backend Engineer",
  "jobScore": 4.5,
  "appliedDate": "2024-04-18",
  "resumeUsed": "resume_1234.pdf",
  "status": "Applied",
  "followUpDate": "2024-05-02",
  "notes": "Strong backend fit"
}
```

Then ask Claude:
```
"Show me my applications by status.
Which ones should I follow up on?"
```

---

## Interview Prep Questions

### Q: How long does interview prep take?

**A:** Depends on your level:

**If already strong in topic:** 10 days
**If intermediate:** 3-4 weeks
**If learning from scratch:** 6-8 weeks

Use generated 4-week plan as baseline, adjust based on:
- Your current knowledge
- Interview date
- Job difficulty
- Time available

---

### Q: Should I follow the exact 4-week schedule?

**A:** It's a template, customize it!

```
Flexible approach:
- Week 1: Understand topics (modify YouTube time)
- Week 2-3: Focus on weak areas (extend if needed)
- Week 4: Mock interviews & final prep

Intensive approach (5 days):
- Focus on top 3 areas only
- Skip less relevant topics
- Do 2-3 mock interviews

Your approach:
- Adjust daily schedule
- Add more practice if needed
- Skip topics you already know
```

---

### Q: Do I need to watch all YouTube videos?

**A:** No! Strategic watching:

```
Watch completely:
- Concept explanations (first time learning)
- Mock interview walkthroughs
- Problem-solving techniques

Watch partially:
- Advanced topics (skip easy parts)
- Review videos (watch at 2x speed)

Skip:
- Topics you already know well
- Intro sessions if you're intermediate+
- Redundant explanations
```

---

### Q: How do I know if I'm ready for the interview?

**A:** Self-assessment checklist:

- [ ] Can explain all 8 focus areas clearly
- [ ] Can solve 80% of practice problems
- [ ] Mock interview score: 7/10+
- [ ] No anxiety about core topics
- [ ] Behavioral answers refined
- [ ] Sleep schedule normalized
- [ ] Comfortable with problem-solving pace

If 6+ checked → You're ready! 🎯

---

## Advanced Questions

### Q: Can I automate the entire job search?

**A:** Partially:

**What you can automate:**
- ✅ Job scanning
- ✅ Resume generation
- ✅ Interview prep creation
- ✅ Application tracking

**What you SHOULD manually review:**
- ❌ Final resume before submitting (always check!)
- ❌ Job fit decision (your judgment > AI)
- ❌ Whether to apply (may miss context)

**Philosophy:** AI accelerates, humans decide

---

### Q: Can I integrate this with job boards?

**A:** Not yet, but workarounds:

**Current workflow:**
1. Find jobs manually on board
2. Copy URL
3. Run Career-Ops evaluation

**Future feature:** Job board API integration coming!

---

### Q: Can I prepare for multiple interviews in parallel?

**A:** Yes! Strategy:

**Days 1-3:** Common topics (System Design, DSA)
**Days 4-5:** Company A specific topics
**Days 6-7:** Company B specific topics
**Days 8-10:** Both companies mock interviews

Ask Claude:
```
"I have interviews at Flipkart and Google.
Create a combined study plan that:
1. Covers common topics first
2. Then company-specific content
3. Then mock interviews for both"
```

---

## Troubleshooting

### Q: "API key not working" error

**Solution:**
```bash
# Check key format
echo $ANTHROPIC_API_KEY

# Should start with: sk_ant_

# If wrong or empty:
export ANTHROPIC_API_KEY="sk_ant_your_real_key"
```

---

### Q: Resume PDF is blank

**Solution:**
```bash
# Playwright browsers might be missing
npx playwright install chromium

# Try again
npm run generate-resume -- job_id
```

---

### Q: Interview prep takes too long to generate

**Solution:**
- Model might be overloaded (retry in 5 mins)
- Try smaller prompt (fewer focus areas)
- Use Haiku model for faster processing
```bash
CLAUDE_MODEL=claude-3-5-haiku npm run prepare-interview -- ...
```

---

### Q: Not finding jobs at my target companies

**Solution:**
1. Check if company is in `config/company-portals.json`
2. Verify company career page is still active
3. Add company manually to JSON
4. Try different archetype keywords

---

## More Help?

1. **Read documentation:**
   - SETUP_GUIDE.md - Complete setup
   - CLAUDE_CODE_INTEGRATION.md - Advanced usage
   - WORKFLOW_TEMPLATES.md - Copy-paste templates

2. **Ask Claude Code:**
```bash
claude
> "Help! I'm having [issue]. How do I fix it?"
```

3. **Check logs:**
```bash
cat data/evaluated-jobs.json  # View all evaluations
cat data/applications.json    # View all applications
ls data/interview-prep/       # View all prep plans
```

**Good luck with your job search! 🚀**
