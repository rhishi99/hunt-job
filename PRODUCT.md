# Product Specification — Hunt-Job

## Register

hunt-job

## Users

**Primary User:** Indian tech professionals and engineers targeting top-tier product companies, high-growth startups, and global engineering centers hiring in India (Bengaluru, Hyderabad, Pune, NCR, Chennai, Mumbai, or Remote).

**Two Distinct Operational Modes:**
1. **The Tactical Morning Triage (10–15 min daily/routine):**
   - Review new job postings detected in the last 24–48 hours across 200+ company ATS portals.
   - Glance at the 10-dimension fit scores (score $\ge$ 4.0/5.0).
   - Trigger 1-click tailored resume generation or launch auto-fill apply sessions.
2. **The Deep Preparation & Application Ritual (Weekend/Evening):**
   - Run in-depth evaluation reports on high-priority dream companies.
   - Generate tailored 4-week interview preparation plans with curated technical concepts and YouTube study tracks.
   - Customize candidate archetypes, salary requirements (in LPA/INR), and dealbreaker constraints.

## Product Purpose

Filter through the overwhelming noise of modern hiring platforms and connect engineering talent directly with verified company ATS job feeds—bypassing ghost jobs, recruiter spam, and outdated aggregators.

Hunt-Job provides:
- **Direct ATS Integration:** Public JSON API querying of Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable + Schema.org JSON-LD fallback for custom career portals.
- **Local SQLite Source of Truth:** Every job posting is content-hashed, deduplicated, and tracked across its full lifecycle (Scanned → Evaluated → Applied → Interviewing → Offered / Closed).
- **10-Dimension Candidate-Job Alignment:** Objective LLM scoring across Salary alignment, Tech stack match, Company culture, Growth, Location/Remote fit, Team dynamics, Product viability, WLB indicators, Career progression, and Dealbreaker compliance.
- **Human-in-the-Loop Auto-Fill Apply:** Real Chromium browser automation that navigates to the application form and fills candidate fields from local profile data while leaving final review and submission in human hands.
- **ATS Resume Synthesis:** Tailored keyword-optimized PDF resume generation using EJS and headless Chromium.

## Brand Personality

**Disciplined, High-Signal, Tactical, Uncluttered.**

- **No Vanity Metrics:** Focus exclusively on actionable, fresh postings meeting the candidate's exact archetype and location criteria.
- **No Uncontrolled Automation:** The AI suggests, formats, fills, and scores—the candidate reviews and clicks submit.
- **High Data Density & Ergonomics:** Modern dark command center UI designed for rapid keyboard triage and clear readability.

## Core Architectural Principles

1. **Local-First & Private:** SQLite database (`data/hunt-job.db`), profile secrets, generated resumes, and logs live 100% on the user's machine.
2. **Provider Agnostic AI:** Support Claude (Anthropic), Gemini (Google), Groq, OpenRouter, and NVIDIA via unified client (`src/core/aiClient.js`).
3. **Deterministic State over Heuristics:** New jobs are computed via exact database diffs against previous scan timestamps, not arbitrary time estimates.
4. **Resilient ATS Crawling:** Auto-exponential backoff, failure count tracking per company, and automatic soft-disabling after 5 consecutive failures.

## Anti-References

- **LinkedIn Job Search:** Cluttered with promoted listings, reposted ghost postings, sponsored spam, and irrelevant keyword stuffing.
- **Blind Auto-Apply Bots:** Indiscriminate mass application submitters that get candidates blacklisted by ATS filters and damage candidate reputation.
- **Generic Scraping Tools:** Fragile HTML scrapers that break constantly and lack ATS-native schema parsing.
