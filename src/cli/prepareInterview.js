#!/usr/bin/env node
import InterviewPrep from '../core/interviewPrep.js';
import ProfileManager from '../core/profileManager.js';
import chalk from 'chalk';
import fs from 'fs';

const interviewPrep = new InterviewPrep();
const profileManager = new ProfileManager();

async function prepareForInterview() {
  const jobDescriptionOrFile = process.argv[2];

  if (!jobDescriptionOrFile) {
    console.error(chalk.red('Error: Please provide a job description or file path'));
    console.log('Usage:');
    console.log('  npm run prepare-interview -- "Job description text"');
    console.log('  npm run prepare-interview -- job-description.txt');
    process.exit(1);
  }

  console.log(chalk.cyan.bold('\n🎯 Generating Interview Preparation Plan...\n'));

  const profile = await profileManager.loadProfile();
  if (!profile) {
    console.error(chalk.red('Error: Profile not found. Run: npm run profile:init'));
    process.exit(1);
  }

  // Check if it's a file path or direct text
  let jobDescription = jobDescriptionOrFile;
  if (fs.existsSync(jobDescriptionOrFile)) {
    jobDescription = fs.readFileSync(jobDescriptionOrFile, 'utf-8');
  }

  const plan = await interviewPrep.generatePrepPlan(jobDescription, profile);

  // Display formatted plan
  const formattedPlan = interviewPrep.formatPrepPlanText(plan);
  console.log(formattedPlan);

  // Display YouTube resources
  const youtubeSection = interviewPrep.formatYouTubeLinks(plan);
  console.log(chalk.yellow(youtubeSection));

  console.log(chalk.green('✅ Full preparation plan saved as HTML in data/\n'));
}

prepareForInterview().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
