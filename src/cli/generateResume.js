#!/usr/bin/env node
import ResumeGenerator from '../core/resumeGenerator.js';
import ProfileManager from '../core/profileManager.js';
import JobEvaluator from '../core/jobEvaluator.js';
import { resolveJobInput } from '../core/jobDocs.js';
import { getDb } from '../core/db.js';
import chalk from 'chalk';

const resumeGenerator = new ResumeGenerator();
const profileManager = new ProfileManager();
const jobEvaluator = new JobEvaluator();

async function generateResume() {
  const jobId = process.argv[2];

  if (!jobId) {
    console.error(chalk.red('Error: Please provide a job ID'));
    console.log('Usage: npm run generate-resume -- <job-id>');
    process.exit(1);
  }

  console.log(chalk.cyan.bold('\n📄 Generating tailored resume...\n'));

  const profile = await profileManager.loadProfile();
  if (!profile) {
    console.error(chalk.red('Error: Profile not found. Run: npm run profile:init'));
    process.exit(1);
  }

  const job = await jobEvaluator.getJobById(jobId);
  if (!job) {
    console.error(chalk.red(`Error: Job with ID ${jobId} not found`));
    process.exit(1);
  }

  // B-02: never hand the model a bare URL — resolve to real JD text or stop.
  let resolved;
  try {
    resolved = await resolveJobInput(job.url, { db: getDb() });
  } catch (e) {
    console.error(chalk.red(`Error: ${e.message}`));
    process.exit(1);
  }

  const result = await resumeGenerator.generate(resolved.jobText, profile, { jobId: resolved.jobId });

  console.log(chalk.green('✅ Resume generated successfully!\n'));
  console.log(chalk.cyan('📄 Resume PDF:'), result.path);
  console.log(chalk.cyan('🎯 Key Skills Highlighted:'), result.keywords.join(', '));
  console.log();
  console.log(chalk.dim('💡 Next: Review the PDF and apply directly to the job posting'))
  console.log();
}

generateResume().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
