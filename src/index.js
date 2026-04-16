import Anthropic from '@anthropic-ai/sdk';
import ProfileManager from './core/profileManager.js';
import JobEvaluator from './core/jobEvaluator.js';
import ResumeGenerator from './core/resumeGenerator.js';
import PortalScanner from './core/portalScanner.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class CareerOpsAgent {
  constructor() {
    this.profileManager = new ProfileManager();
    this.jobEvaluator = new JobEvaluator();
    this.resumeGenerator = new ResumeGenerator();
    this.portalScanner = new PortalScanner();
  }

  async initialize() {
    const profile = await this.profileManager.loadProfile();
    if (!profile) {
      console.log('No profile found. Starting onboarding...');
      await this.onboard();
    }
  }

  async onboard() {
    const profile = await this.profileManager.initializeProfile();
    console.log('Profile created successfully!');
    return profile;
  }

  async evaluateJob(jobUrl) {
    const profile = await this.profileManager.loadProfile();
    if (!profile) {
      throw new Error('Profile not found. Please run onboarding first.');
    }

    const evaluation = await this.jobEvaluator.evaluate(jobUrl, profile);
    return evaluation;
  }

  async scanPortals(archetype, companies = null) {
    const jobs = await this.portalScanner.scan(archetype, companies);
    return jobs;
  }

  async generateResume(jobId) {
    const profile = await this.profileManager.loadProfile();
    const job = await this.jobEvaluator.getJobById(jobId);
    const resume = await this.resumeGenerator.generate(job, profile);
    return resume;
  }

  async chat(userMessage) {
    const profile = await this.profileManager.loadProfile();

    const systemPrompt = this.buildSystemPrompt(profile);

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  buildSystemPrompt(profile) {
    return `You are Career-Ops, an AI job search agent powered by Claude Code. You help users find and apply to jobs intelligently.

User Profile:
- Archetypes: ${profile?.archetypes?.join(', ') || 'Not configured'}
- Salary Range: ${profile?.salary?.min || 'Not set'} - ${profile?.salary?.max || 'Not set'}
- Preferred Tech Stack: ${profile?.techStack?.join(', ') || 'Not configured'}
- Remote Preference: ${profile?.remotePreference || 'Not specified'}

You have access to these capabilities:
1. evaluate-job: Score a job posting across 10 dimensions
2. scan-portals: Search 45+ company career pages
3. generate-resume: Create ATS-optimized tailored resumes
4. profile: Manage user profile and preferences
5. dashboard: Track applications and scores

Always act as a helpful advisor. Score jobs on a scale of 1-5, only recommending applications for scores ≥4.0.
Be conversational and provide detailed analysis of why jobs score the way they do.`;
  }
}

export default CareerOpsAgent;
