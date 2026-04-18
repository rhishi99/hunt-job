import 'dotenv/config';
import { getActiveClient } from './aiClient.js';
import { createLogger } from './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('jobEvaluator');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

class JobEvaluator {
  constructor() {
    this.client = getActiveClient('heavy');
    this.evaluatedJobsPath = path.join(dataDir, 'evaluated-jobs.json');
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.evaluatedJobsPath)) {
      fs.writeFileSync(this.evaluatedJobsPath, '[]', 'utf-8');
    }
  }

  async evaluate(jobInput, profile) {
    log.op('evaluate_start', { input: jobInput.slice(0, 100) });
    // If it's a Lever job URL, fetch description via API
    let jobText = jobInput;
    const leverMatch = jobInput.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/);
    if (leverMatch) {
      try {
        const r = await fetch(`https://api.lever.co/v0/postings/${leverMatch[1]}/${leverMatch[2]}?mode=json`);
        if (r.ok) {
          const job = await r.json();
          const desc = (job.description || '').replace(/<li>/gi, '\n- ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          jobText = `Job Title: ${job.text}\nCompany: ${leverMatch[1]}\nLocation: ${job.categories?.location || ''}\n\n${desc}`;
        }
      } catch {}
    }

    const evaluationPrompt = this.buildEvaluationPrompt(jobText, profile);

    const response = await this.client.messages.create({
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: evaluationPrompt,
        },
      ],
    });

    const evaluation = this.parseEvaluationResponse(response.content[0].text);
    await this.saveEvaluatedJob(jobInput, evaluation, profile);
    log.op('evaluate_done', { score: evaluation.overallScore, recommendation: evaluation.recommendation });

    return evaluation;
  }

  buildEvaluationPrompt(jobUrl, profile) {
    return `Please evaluate this job posting: ${jobUrl}

Candidate Profile:
- Target Archetypes: ${profile.archetypes?.join(', ')}
- Salary Range: $${profile.salary?.min} - $${profile.salary?.max}
- Tech Stack: ${profile.techStack?.join(', ')}
- Remote Preference: ${profile.remotePreference}
- Dealbreakers: ${profile.dealbreakers?.join(', ')}
- Years of Experience: ${profile.yearsOfExperience}

Please evaluate this job across these 10 dimensions on a scale of 1-5:
1. Salary Alignment
2. Tech Stack Compatibility
3. Company Culture Fit
4. Growth Opportunities
5. Location/Remote Requirements
6. Team Dynamics (if available)
7. Product Market Fit
8. Work-Life Balance Indicators
9. Career Progression Potential
10. Dealbreaker Compliance

Provide the following as a JSON object with exactly these keys:
- "overallScore": number 1-5
- "dimensions": object with each dimension name as key and score 1-5 as value
- "matches": array of strings (what fits well)
- "mismatches": array of strings (what doesn't fit or is missing)
- "reasoning": string (2-3 sentences explaining the score)
- "recommendation": one of "Apply", "Maybe", or "Skip"

Return ONLY valid JSON, no markdown fences.`;
  }

  parseEvaluationResponse(responseText) {
    try {
      const stripped = responseText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse evaluation as JSON, returning text:', e.message);
    }

    return {
      overallScore: 0,
      analysis: responseText,
      dimensions: {},
      recommendation: 'REVIEW'
    };
  }

  async saveEvaluatedJob(jobUrl, evaluation, profile) {
    const evaluatedJobs = JSON.parse(fs.readFileSync(this.evaluatedJobsPath, 'utf-8'));

    const job = {
      id: `job_${Date.now()}`,
      url: jobUrl,
      evaluation,
      profile: {
        archetypes: profile.archetypes,
        salaryRange: profile.salary
      },
      evaluatedAt: new Date().toISOString()
    };

    evaluatedJobs.push(job);
    fs.writeFileSync(this.evaluatedJobsPath, JSON.stringify(evaluatedJobs, null, 2), 'utf-8');

    return job;
  }

  async getJobById(jobId) {
    const evaluatedJobs = JSON.parse(fs.readFileSync(this.evaluatedJobsPath, 'utf-8'));
    return evaluatedJobs.find(job => job.id === jobId);
  }

  async getEvaluatedJobs() {
    return JSON.parse(fs.readFileSync(this.evaluatedJobsPath, 'utf-8'));
  }
}

export default JobEvaluator;
