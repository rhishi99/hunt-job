# Quick Start - Get Running in 10 Minutes

## 1. Install (2 minutes)

```bash
# Install Node.js if needed (should be v16+)
node --version

# Clone and enter directory
git clone https://github.com/rhishi99/hunt-job.git
cd hunt-job

# Install dependencies
npm install

# Set API key (copy from https://console.anthropic.com)
export ANTHROPIC_API_KEY="sk_ant_your_key_here"
```

## 2. First Profile (3 minutes)

```bash
npm run profile:init
```

Answer the questions:
- Name, email, phone
- Current role
- Years of experience
- **Archetypes:** Type `Backend Engineer` or your target role
- **Salary:** Type two numbers (min/max in lakhs)
- **Tech Stack:** `Python,Java,PostgreSQL`
- **Dealbreakers:** Things you won't accept

## 3. First Job Evaluation (2 minutes)

Find any job posting URL (Flipkart, Google, Amazon, etc.)

```bash
npm run evaluate-job -- "https://careers.flipkart.com/jobs/backend-engineer"
```

See score output:
```
✅ Score: 4.2/5.0
Recommendation: APPLY

Salary: 4.5/5
Tech Stack: 4.0/5
Culture: 4.0/5
...
```

## 4. Generate Resume (2 minutes)

```bash
npm run generate-resume -- job_<the_id_from_above>
```

Output:
```
✅ Resume generated: data/resumes/resume_1234567890.pdf
Keywords: System Design, Microservices, Java, ...
```

## 5. Bonus: Interview Prep (1 minute)

```bash
npm run prepare-interview -- "Senior Backend Engineer at Flipkart"
```

See:
- 8 focus areas
- YouTube links for each
- 4-week study schedule
- Behavioral questions

---

## That's It! 🎉

You now have:
- ✅ Job evaluated
- ✅ Resume generated
- ✅ Interview prep ready

**Next Steps:**
1. Apply to the job on company portal
2. Save resume to your device
3. Start interview prep plan
4. Repeat for more jobs!

---

## Bonus: Use Claude Code for Faster Processing

```bash
# Start Claude Code
claude

# Then use natural language:
> "Find backend jobs at Flipkart, Google, and Amazon
   Score each one
   Generate resumes for top 3
   Show me the results"

# Claude does all of it! ⚡
```

---

## If You Get Stuck

### API Key Error?
```bash
# Verify key is set
echo $ANTHROPIC_API_KEY

# Set if empty
export ANTHROPIC_API_KEY="sk_ant_..."
```

### No PDF Generated?
```bash
# Install browsers
npx playwright install
npm run generate-resume -- job_id
```

### Profile Not Found?
```bash
# Create profile
npm run profile:init

# Check it exists
cat config/profile.yml
```

---

**Congratulations! You're ready to search. Good luck! 🚀**
