import inquirer from 'inquirer';
import chalk from 'chalk';
import { resolveJobInput } from '../../core/jobDocs.js';
import { getDb } from '../../core/db.js';
import { clear, banner, section, success, err, pressEnter } from '../ui.js';

export async function runResumeGenFlow(profile, jobDescriptionOrUrl, jobId = null) {
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
    // B-02: URL -> real JD text (or a clear error); the model never sees a bare link
    const resolved = await resolveJobInput(jobDescription, { db: getDb() });
    const result = await generator.generate(resolved.jobText, profile, { jobId: jobId || resolved.jobId });

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
