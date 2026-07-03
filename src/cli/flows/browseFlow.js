/**
 * browseFlow.js — instant "Browse Saved Jobs" menu flow. Queries the jobs
 * table (no network) and routes a picked job into the same evaluate/prep/
 * resume/apply actions the live scan flow uses.
 */
import inquirer from 'inquirer';
import chalk from 'chalk';
import { queryJobs } from '../../core/scan/query.js';
import { daysAgoLabel } from '../../core/scan/normalize.js';
import { clear, banner, section, warn, err, pressEnter } from '../ui.js';
import { runEvaluateFlow } from './evaluateFlow.js';
import { runInterviewPrepFlow } from './prepFlow.js';
import { runResumeGenFlow } from './resumeFlow.js';
import { applyToJob } from './applyFlow.js';

export async function runBrowseFlow(profile) {
  clear(); banner();
  section('Browse Saved Jobs  (instant — from your last scans)');

  const roleChoices = profile.archetypes?.length
    ? [...profile.archetypes, 'Any role', 'Other (type manually)']
    : ['Any role', 'Software Engineer', 'DevOps Engineer', 'Data Engineer', 'Other (type manually)'];

  const { roleChoice } = await inquirer.prompt([{
    type: 'list', name: 'roleChoice', message: 'Filter saved jobs by role:', choices: roleChoices,
  }]);
  let archetype = roleChoice === 'Any role' ? undefined : roleChoice;
  if (roleChoice === 'Other (type manually)') {
    const { custom } = await inquirer.prompt([{ type: 'input', name: 'custom', message: 'Enter role:' }]);
    archetype = custom;
  }

  const { recency } = await inquirer.prompt([{
    type: 'list', name: 'recency', message: 'Recency:', default: 1,
    choices: [
      { name: '🔥  Last 7 days', value: 7 },
      { name: '📅  Last 30 days', value: 30 },
      { name: '📆  Last 90 days', value: 90 },
      { name: '📋  All saved', value: 0 },
    ],
  }]);

  const { location } = await inquirer.prompt([{
    type: 'list', name: 'location', message: 'Location:', choices: [
      { name: '🇮🇳  India (default)', value: 'india' },
      { name: '🌐  Remote (anywhere)', value: 'remote' },
      { name: '🗺️   All locations', value: 'all' },
    ],
  }]);

  const jobs = queryJobs({
    archetype,
    sinceDays: recency || undefined,
    remote: location === 'remote',
    allLocations: location === 'all',
    limit: 60,
  });

  if (!jobs.length) {
    warn('No saved jobs match. Run a live "Scan Job Portals" first, or broaden the filters.');
    await pressEnter();
    return;
  }

  section(`${jobs.length} Saved Roles`);
  while (true) {
    const { pick } = await inquirer.prompt([{
      type: 'list', name: 'pick', message: 'Select a job:', pageSize: 15,
      choices: [
        ...jobs.map((j, i) => {
          const fresh = j.postedAt && Date.now() - j.postedAt < 172800000 ? chalk.red(' 🔥') : '';
          const age = daysAgoLabel(j.postedAt);
          return { name: `${j.title}  —  ${j.company}  (${j.location || 'India'})${age ? chalk.gray(` · ${age}`) : ''}${fresh}`, value: i };
        }),
        new inquirer.Separator(),
        { name: '↩  Back to main menu', value: -1 },
      ],
    }]);
    if (pick === -1) return;

    const selected = jobs[pick];
    const { action } = await inquirer.prompt([{
      type: 'list', name: 'action', message: `${selected.title} @ ${selected.company}:`,
      choices: [
        { name: '🚀  Full workflow (eval → prep → resume → apply)', value: 'full' },
        { name: '📊  Evaluate', value: 'evaluate' },
        { name: '🎯  Interview prep', value: 'prep' },
        { name: '📄  Generate resume', value: 'resume' },
        { name: '✅  Apply (save & open link)', value: 'apply' },
        new inquirer.Separator(),
        { name: '🔙  Pick another job', value: 'pickagain' },
        { name: '↩  Back to main menu', value: 'back' },
      ],
    }]);
    if (action === 'back') return;
    if (action === 'pickagain') continue;

    const jobInput = selected.description
      ? `Position: ${selected.title}\nCompany: ${selected.company}\nLocation: ${selected.location || 'India'}\n\n${selected.description}\n\nJob URL: ${selected.url || ''}`
      : (selected.url || '');

    if (action === 'full') {
      try { await runEvaluateFlow(profile, jobInput, true); } catch (e) { err(`Evaluate failed: ${e.message}`); }
      try { await runInterviewPrepFlow(profile, jobInput); } catch (e) { err(`Prep failed: ${e.message}`); }
      try { await runResumeGenFlow(profile, jobInput); } catch (e) { err(`Resume failed: ${e.message}`); }
      try { await applyToJob(selected, profile, jobInput); } catch (e) { err(`Apply failed: ${e.message}`); }
    }
    if (action === 'evaluate') { try { await runEvaluateFlow(profile, jobInput); } catch (e) { err(`Evaluate failed: ${e.message}`); } }
    if (action === 'prep') { try { await runInterviewPrepFlow(profile, jobInput); } catch (e) { err(`Prep failed: ${e.message}`); } }
    if (action === 'resume') { try { await runResumeGenFlow(profile, jobInput); } catch (e) { err(`Resume failed: ${e.message}`); } }
    if (action === 'apply') { try { await applyToJob(selected, profile, jobInput); } catch (e) { err(`Apply failed: ${e.message}`); } }
  }
}
