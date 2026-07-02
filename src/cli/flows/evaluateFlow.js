import inquirer from 'inquirer';
import chalk from 'chalk';
import JobEvaluator from '../../core/jobEvaluator.js';
import { clear, banner, section, success, warn, err, pressEnter, scoreBar } from '../ui.js';
import { runInterviewPrepFlow } from './prepFlow.js';
import { runResumeGenFlow } from './resumeFlow.js';

export async function runEvaluateFlow(profile, jobDescriptionOrUrl, skipNextStep = false) {
  clear(); banner();
  section('Evaluate a Job');

  let jobInput = jobDescriptionOrUrl;

  if (!jobInput) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: 'Paste job URL or job description text:',
      validate: v => v.trim().length > 10 || 'Please enter a URL or description'
    }]);
    jobInput = input.trim();
  }

  console.log(chalk.gray('\n  Evaluating with AI across 10 dimensions...\n'));

  try {
    const evaluator = new JobEvaluator();
    const { evaluation } = await evaluator.evaluate(jobInput, profile);

    section('Evaluation Results');

    if (evaluation.overallScore !== undefined) {
      console.log('\n  ' + chalk.bold('Overall Score:  ') + scoreBar(evaluation.overallScore));
    }

    if (evaluation.recommendation) {
      const colors = { Apply: chalk.green.bold, Maybe: chalk.yellow.bold, Skip: chalk.red.bold };
      const c = colors[evaluation.recommendation] || chalk.white.bold;
      console.log('  ' + chalk.bold('Recommendation: ') + c(evaluation.recommendation));
    }

    if (evaluation.dimensions && Object.keys(evaluation.dimensions).length) {
      console.log(chalk.cyan('\n  Dimensions:'));
      Object.entries(evaluation.dimensions).forEach(([dim, score]) => {
        const s = typeof score === 'number' ? score : parseFloat(score) || 0;
        console.log(`    ${dim.padEnd(30)} ${scoreBar(s)}`);
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

    if (evaluation.reasoning) {
      console.log(chalk.gray(`\n  💭 ${evaluation.reasoning}`));
    }

    // Parse failure fallback shape: {overallScore:0, analysis, dimensions:{}, recommendation:'REVIEW'}
    const isUnparsed = !!evaluation.analysis && !(evaluation.dimensions && Object.keys(evaluation.dimensions).length);
    if (isUnparsed) {
      warn('Could not parse a structured score — showing the raw AI response:');
      console.log(chalk.gray(`\n  ${evaluation.analysis}`));
      await pressEnter();
      return;
    }

    // Offer next steps based on score
    const score = evaluation.overallScore || 0;
    if (score >= 4.0) {
      success('Strong match! Recommended to apply.');
      if (!skipNextStep) {
        const { next } = await inquirer.prompt([{
          type: 'list',
          name: 'next',
          message: 'What would you like to do next?',
          choices: [
            { name: '🎯 Generate interview prep plan', value: 'prep' },
            { name: '📄 Generate tailored resume', value: 'resume' },
            { name: '↩  Back to main menu', value: 'back' }
          ]
        }]);
        if (next === 'prep') await runInterviewPrepFlow(profile, jobInput);
        if (next === 'resume') await runResumeGenFlow(profile, jobInput);
      } else {
        await pressEnter();
      }
    } else if (score >= 3.0) {
      warn('Borderline match. Consider applying if role aligns with long-term goals.');
      await pressEnter();
    } else {
      err('Weak match. Likely not worth applying.');
      await pressEnter();
    }
  } catch (e) {
    err(`Evaluation failed: ${e.message}`);
    await pressEnter();
  }
}
