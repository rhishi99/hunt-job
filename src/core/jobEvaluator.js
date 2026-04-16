import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

class JobEvaluator {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
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

  async evaluate(jobUrl, profile) {
    const evaluationPrompt = this.buildEvaluationPrompt(jobUrl, profile);

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: evaluationPrompt,
        },
      ],
    });

    const evaluation = this.parseEvaluationResponse(response.content[0].text);
    await this.saveEvaluatedJob(jobUrl, evaluation, profile);

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

Provide:
- Overall Score (1-5)
- Dimension Breakdown
- Key Matches
- Key Mismatches
- Recommendation (Apply/Maybe/Skip)

Format your response as JSON.`;
  }

  parseEvaluationResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse evaluation as JSON, returning text:', e);
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
