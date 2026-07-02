import inquirer from 'inquirer';
import chalk from 'chalk';
import InterviewPrep from '../../core/interviewPrep.js';
import { clear, banner, section, success, err, pressEnter } from '../ui.js';

export async function runInterviewPrepFlow(profile, jobDescriptionOrUrl) {
  clear(); banner();
  section('Interview Preparation');

  let jobDescription = jobDescriptionOrUrl;

  if (!jobDescription) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: 'Paste job description or URL:',
      validate: v => v.trim().length > 10 || 'Please enter content'
    }]);
    jobDescription = input.trim();
  }

  console.log(chalk.gray('\n  Generating personalised prep plan...\n'));

  try {
    const prep = new InterviewPrep();
    const { plan } = await prep.generatePrepPlan(jobDescription, profile);

    section('Prep Plan');
    console.log(prep.formatPrepPlanText(plan));

    const youtubeSection = prep.formatYouTubeLinks(plan);
    if (youtubeSection) console.log(chalk.yellow(youtubeSection));

    success('Prep plan saved as HTML file in data/');
    await pressEnter();
  } catch (e) {
    err(`Prep generation failed: ${e.message}`);
    await pressEnter();
  }
}
