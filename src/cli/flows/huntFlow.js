import inquirer from 'inquirer';
import chalk from 'chalk';
import JobEvaluator from '../../core/jobEvaluator.js';
import InterviewPrep from '../../core/interviewPrep.js';
import { clear, banner, section, success, warn, err, pressEnter, scoreBar } from '../ui.js';

export async function runFullWorkflow(profile) {
  clear(); banner();
  section('Full Apply Workflow');
  console.log(chalk.white('\n  This guided flow takes you from job URL → eval → prep → resume.\n'));

  const { url } = await inquirer.prompt([{
    type: 'input',
    name: 'url',
    message: 'Paste the job URL or full job description:',
    validate: v => v.trim().length > 10 || 'Required'
  }]);

  const jobInput = url.trim();

  // Step 1 — Evaluate
  section('Step 1 / 3  —  Evaluating');
  console.log(chalk.gray('  Running AI evaluation...\n'));
  let evaluation;
  try {
    const evaluator = new JobEvaluator();
    const evalResult = await evaluator.evaluate(jobInput, profile);
    evaluation = evalResult.evaluation;
    const score = evaluation.overallScore || 0;
    console.log('\n  ' + chalk.bold('Overall Score:  ') + scoreBar(score));
    const recMap = { Apply: chalk.green.bold, Maybe: chalk.yellow.bold, Skip: chalk.red.bold };
    const c = recMap[evaluation.recommendation] || chalk.white.bold;
    console.log('  ' + chalk.bold('Recommendation: ') + c(evaluation.recommendation || '?'));

    if (evaluation.dimensions && Object.keys(evaluation.dimensions).length) {
      console.log(chalk.cyan('\n  Dimensions:'));
      Object.entries(evaluation.dimensions).forEach(([dim, s]) => {
        const ds = typeof s === 'number' ? s : parseFloat(s) || 0;
        console.log(`    ${dim.padEnd(30)} ${scoreBar(ds)}`);
      });
    }
    if (evaluation.matches?.length) {
      console.log(chalk.green('\n  ✅ Matches:'));
      evaluation.matches.forEach(m => console.log(`     • ${m}`));
    }
    if (evaluation.mismatches?.length) {
      console.log(chalk.yellow('\n  ⚠  Gaps:'));
      evaluation.mismatches.forEach(m => console.log(`     • ${m}`));
    }

    if (score < 3.0) {
      warn('Score too low to continue. Consider a different role.');
      await pressEnter();
      return;
    }
    if (score >= 4.0) success('Strong match! Recommended to apply.');
    else warn('Borderline match. Consider if role aligns with your goals.');
  } catch (e) {
    err(`Evaluation failed: ${e.message}`);
    await pressEnter();
    return;
  }

  // Step 2 — Interview Prep
  section('Step 2 / 3  —  Interview Prep');
  const { doPr } = await inquirer.prompt([{
    type: 'confirm', name: 'doPr',
    message: 'Generate interview prep plan?', default: true
  }]);
  if (doPr) {
    console.log(chalk.gray('\n  Generating prep plan...\n'));
    try {
      const prep = new InterviewPrep();
      const { plan } = await prep.generatePrepPlan(jobInput, profile);
      console.log(prep.formatPrepPlanText(plan));
      success('Prep plan saved as HTML in data/');
    } catch (e) { err(`Prep failed: ${e.message}`); }
  }

  // Step 3 — Resume
  section('Step 3 / 3  —  Tailored Resume');
  const { doResume } = await inquirer.prompt([{
    type: 'confirm', name: 'doResume',
    message: 'Generate tailored resume PDF?', default: true
  }]);
  if (doResume) {
    console.log(chalk.gray('\n  Generating resume...\n'));
    try {
      const { default: ResumeGenerator } = await import('../../core/resumeGenerator.js');
      const gen = new ResumeGenerator();
      const result = await gen.generate(jobInput, profile);
      success(`Resume saved: ${result.path}`);
    } catch (e) { err(`Resume failed: ${e.message}`); }
  }

  section('All Done');
  console.log(chalk.green.bold('\n  ✓  Application package ready. Good luck! 🚀\n'));
  await pressEnter();
}
