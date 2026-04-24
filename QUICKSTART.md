# Hunt-Job — Quick Start Guide

Forgot how to run it? Here are all the ways:

## 🚀 Easiest (Recommended)

### On Windows:

**Option A: Better display (recommended)**
```bash
npm start
```
Or:
```bash
node hunt-job.js
```

**Option B: Classic batch file**
```bash
hunt-job.bat
```
(Note: Windows Command Prompt shows ASCII-only menu. For Unicode/emoji support, use `npm start`)

### On macOS/Linux:
```bash
bash hunt-job.sh
```
Or with execute permissions:
```bash
chmod +x hunt-job.sh
./hunt-job.sh
```

### Universal (All Platforms):
```bash
npm start
```

---

## 🎯 Direct Commands (Skip the Menu)

```bash
# Evaluate a job posting
npm run evaluate-job

# Scan job portals for matches
npm run scan-portals

# Generate a tailored resume
npm run generate-resume

# Prepare for an interview
npm run prepare-interview

# Edit your profile
npm run profile:edit

# Setup API key
npm run setup

# Initialize profile (first time only)
npm run profile:init
```

---

## 📋 First-Time Setup

1. **Set your API key:**
   ```bash
   npm run setup
   ```

2. **Initialize your profile:**
   ```bash
   npm run profile:init
   ```

3. **Start the app:**
   ```bash
   npm start
   ```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
ANTHROPIC_API_KEY=your_api_key_here
CLAUDE_MODEL=claude-3-5-sonnet-20241022
```

Or set them in your terminal:

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="your_key"
```

**macOS/Linux:**
```bash
export ANTHROPIC_API_KEY="your_key"
```

---

## 🆘 Troubleshooting

**"Node is not found"**
- Install Node.js from https://nodejs.org

**"Module not found"**
- Run: `npm install`

**"API key not working"**
- Run: `npm run setup`
- Or create `.env` with your API key

**Bat file gives "syntax error"**
- Run: `npm start` instead (universal solution)

---

## 📁 What Gets Created

After first run:
- `config/profile.yml` — Your profile (keep this private!)
- `modes/_profile.md` — Profile backup
- `data/evaluated-jobs.json` — Job evaluation history
- `data/resumes/` — Generated resume PDFs
- `data/interview-prep/` — Interview prep guides

---

**Built with ❤️ using Claude & Claude Code**

**Based on:** Career-Ops (See [COMPARISON.md](COMPARISON.md) for feature comparison)
