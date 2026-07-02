import inquirer from 'inquirer';
import chalk from 'chalk';
import { clear, banner, section, success, err, pressEnter } from '../ui.js';

export async function runResumeGenFlow(profile, jobDescriptionOrUrl) {
  clear(); banner();
  section('Generate Tailored Resume');

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

  console.log(chalk.gray('\n  Generating ATS-optimized resume PDF...\n'));

  try {
    const { default: ResumeGenerator } = await import('../../core/resumeGenerator.js');
    const generator = new ResumeGenerator();
    const result = await generator.generate(jobDescription, profile);

    success(`Resume saved: ${result.path}`);
    if (result.keywords?.length) {
      console.log(chalk.cyan('\n  Top keywords injected:'));
      result.keywords.slice(0, 10).forEach(k => console.log(`     • ${k}`));
    }
    await pressEnter();
  } catch (e) {
    err(`Resume generation failed: ${e.message}`);
    await pressEnter();
  }
}
