#!/usr/bin/env node
import JobEvaluator from '../core/jobEvaluator.js';
import ProfileManager from '../core/profileManager.js';
import chalk from 'chalk';

const jobEvaluator = new JobEvaluator();
const profileManager = new ProfileManager();

async function evaluateJob() {
  const jobUrl = process.argv[2];

  if (!jobUrl) {
    console.error(chalk.red('Error: Please provide a job URL'));
    console.log('Usage: npm run evaluate-job -- <job-url>');
    process.exit(1);
  }

  console.log(chalk.cyan.bold('\n📊 Evaluating job posting...\n'));

  const profile = await profileManager.loadProfile();
  if (!profile) {
    console.error(chalk.red('Error: Profile not found. Run: npm run profile:init'));
    process.exit(1);
  }

  const evaluation = await jobEvaluator.evaluate(jobUrl, profile);

  console.log(chalk.green('Evaluation Complete!\n'));

  if (evaluation.overallScore !== undefined) {
    const scoreColor = evaluation.overallScore >= 4.0 ? chalk.green : evaluation.overallScore >= 3.0 ? chalk.yellow : chalk.red;
    console.log(scoreColor.bold(`Overall Score: ${evaluation.overallScore}/5.0`));
  }

  if (evaluation.recommendation) {
    const recColor = evaluation.recommendation === 'Apply' ? chalk.green : evaluation.recommendation === 'Maybe' ? chalk.yellow : chalk.red;
    console.log(recColor(`Recommendation: ${evaluation.recommendation}`));
  }

  if (evaluation.dimensions) {
    console.log(chalk.cyan('\nDimension Breakdown:'));
    Object.entries(evaluation.dimensions).forEach(([dim, score]) => {
      console.log(`  ${dim}: ${score}/5.0`);
    });
  }

  if (evaluation.matches) {
    console.log(chalk.green('\n✅ Key Matches:'));
    evaluation.matches.forEach(m => console.log(`  - ${m}`));
  }

  if (evaluation.mismatches) {
    console.log(chalk.yellow('\n⚠️ Key Mismatches:'));
    evaluation.mismatches.forEach(m => console.log(`  - ${m}`));
  }

  console.log();
}

evaluateJob().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
