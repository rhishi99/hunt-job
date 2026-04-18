#!/usr/bin/env node
import 'dotenv/config';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ProfileManager from '../core/profileManager.js';
import JobEvaluator from '../core/jobEvaluator.js';
import InterviewPrep from '../core/interviewPrep.js';
import PortalScanner, { SCANNABLE_COMPANIES } from '../core/portalScanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileManager = new ProfileManager();

// ─── UI Helpers ──────────────────────────────────────────────────────────────

function clear() { process.stdout.write('\x1Bc'); }

function banner() {
  console.log(chalk.cyan.bold('╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║') + chalk.white.bold('   🎯  CAREER-OPS  —  Job Search Agent    ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════╝'));
}

function section(title) {
  console.log('\n' + chalk.cyan.bold(`── ${title} `) + chalk.cyan('─'.repeat(Math.max(0, 42 - title.length))));
}

function info(label, value) {
  console.log(chalk.gray(`  ${label.padEnd(18)}: `) + chalk.white(value || chalk.italic.gray('not set')));
}

function success(msg) { console.log(chalk.green(`\n  ✓  ${msg}`)); }
function warn(msg)    { console.log(chalk.yellow(`\n  ⚠  ${msg}`)); }
function err(msg)     { console.log(chalk.red(`\n  ✗  ${msg}`)); }
function hint(msg)    { console.log(chalk.gray(`\n     ${msg}`)); }

async function pressEnter() {
  await inquirer.prompt([{ type: 'input', name: '_', message: chalk.gray('Press Enter to continue...') }]);
}

function scoreBar(score, max = 5) {
  const filled = Math.round((score / max) * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = score >= 4 ? chalk.green : score >= 3 ? chalk.yellow : chalk.red;
  return color(`${bar} ${score.toFixed(1)}/${max}`);
}

// ─── Profile Health Check ────────────────────────────────────────────────────

async function getProfileStatus() {
  const profile = await profileManager.loadProfile();
  if (!profile || !profile.name) return { profile: null, ready: false };
  const ready = !!(profile.name && profile.email && profile.techStack?.length && profile.archetypes?.length);
  return { profile, ready };
}

function showProfileSummary(profile) {
  section('Your Profile');
  info('Name', profile.name);
  info('Role', profile.currentRole);
  info('Experience', `${profile.yearsOfExperience} years`);
  info('Location', profile.location);
  info('CTC Range', profile.salary ? `₹${profile.salary.min}–${profile.salary.max} LPA` : null);
  info('Archetypes', (profile.archetypes || []).join(', '));
  info('Work Mode', profile.remotePreference);
  info('Top Skills', (profile.techStack || []).slice(0, 6).join(', '));
}

// ─── Workflows ───────────────────────────────────────────────────────────────

async function runSetupFlow() {
  clear(); banner();
  section('First-Time Setup');
  console.log(chalk.white('\n  No profile found. Let\'s get you set up in 2 steps.\n'));

  // Step 1: Check at least one AI provider key is present
  const hasAnyKey = ['ANTHROPIC_API_KEY','OPENROUTER_API_KEY','GROQ_API_KEY','NVIDIA_API_KEY','GEMINI_API_KEY']
    .some(k => !!process.env[k]);
  if (!hasAnyKey) {
    warn('No AI provider key configured.');
    hint('Run: npm run setup   to add an API key first, then come back.');
    await pressEnter();
    return false;
  }
  success('AI provider key found.');

  // Step 2: Parse resume
  const { hasResume } = await inquirer.prompt([{
    type: 'confirm',
    name: 'hasResume',
    message: 'Do you have your resume as a PDF?',
    default: true
  }]);

  if (hasResume) {
    const { resumePath } = await inquirer.prompt([{
      type: 'input',
      name: 'resumePath',
      message: 'Path to your resume PDF:',
      validate: v => fs.existsSync(v.trim()) || 'File not found'
    }]);

    console.log(chalk.gray('\n  Extracting and parsing resume via AI...\n'));
    try {
      const { parseResume } = await import('./parseResume.js').catch(() => null) ||
                               await import('../core/resumeParser.js');

      if (typeof parseResume === 'function') {
        // Direct core call — launch the interactive parseResume CLI
        const { spawn } = await import('child_process');
        await new Promise((resolve, reject) => {
          const child = spawn('node', [
            path.join(__dirname, 'parseResume.js'),
            resumePath.trim()
          ], { stdio: 'inherit' });
          child.on('close', code => code === 0 ? resolve() : reject(new Error(`Exited ${code}`)));
        });
      }
    } catch (e) {
      err(`Resume parse failed: ${e.message}`);
    }
  } else {
    hint('Running manual profile setup...');
    const { spawn } = await import('child_process');
    await new Promise(resolve => {
      const child = spawn('node', [path.join(__dirname, 'profileInit.js')], { stdio: 'inherit' });
      child.on('close', resolve);
    });
  }

  return true;
}

async function runEvaluateFlow(profile, jobDescriptionOrUrl) {
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
    const evaluation = await evaluator.evaluate(jobInput, profile);

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

    // Offer next steps based on score
    const score = evaluation.overallScore || 0;
    if (score >= 4.0) {
      success('Strong match! Recommended to apply.');
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
    } else if (score >= 3.0) {
      warn('Borderline match. Consider applying if role aligns with long-term goals.');
      if (!evaluation.mismatches?.length) {
        const reason = evaluation.analysis || evaluation.summary || evaluation.reasoning || '';
        if (reason) console.log(chalk.gray(`\n     Why: ${reason.slice(0, 400)}`));
      }
      await pressEnter();
    } else {
      err('Weak match. Likely not worth applying.');
      if (!evaluation.mismatches?.length) {
        const reason = evaluation.analysis || evaluation.summary || evaluation.reasoning || '';
        if (reason) console.log(chalk.gray(`\n     Why: ${reason.slice(0, 400)}`));
      }
      await pressEnter();
    }
  } catch (e) {
    err(`Evaluation failed: ${e.message}`);
    await pressEnter();
  }
}

async function runInterviewPrepFlow(profile, jobDescriptionOrUrl) {
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
    const plan = await prep.generatePrepPlan(jobDescription, profile);

    section('Prep Plan');
    console.log(prep.formatPrepPlanText(plan));

    const youtubeSection = prep.formatYouTubeLinks(plan);
    if (youtubeSection) console.log(chalk.yellow(youtubeSection));

    success('Full plan saved to data/interview-prep/');
    await pressEnter();
  } catch (e) {
    err(`Prep generation failed: ${e.message}`);
    await pressEnter();
  }
}

async function runResumeGenFlow(profile, jobDescriptionOrUrl) {
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
    const { default: ResumeGenerator } = await import('../core/resumeGenerator.js');
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

async function runScanFlow(profile) {
  clear(); banner();
  section('Scan Job Portals');

  const archetypeChoices = profile.archetypes?.length
    ? [...profile.archetypes, 'Other (type manually)']
    : ['Software Engineer', 'Data Engineer', 'DevOps Engineer', 'Backend Engineer', 'Other (type manually)'];

  const { archetypeChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'archetypeChoice',
    message: 'Which role are you scanning for?',
    choices: archetypeChoices
  }]);

  let archetype = archetypeChoice;
  if (archetypeChoice === 'Other (type manually)') {
    const { custom } = await inquirer.prompt([{ type: 'input', name: 'custom', message: 'Enter role:' }]);
    archetype = custom;
  }

  const scannableNames = SCANNABLE_COMPANIES.map(c => c.name);
  const total = SCANNABLE_COMPANIES.length;

  const { scanAll } = await inquirer.prompt([{
    type: 'confirm',
    name: 'scanAll',
    message: `Scan all ${total} companies with public job APIs? (No = pick specific ones)`,
    default: true
  }]);

  let selectedCompanies = null;
  if (!scanAll) {
    const { picked } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'picked',
      message: `Select companies to scan (${total} available via API):`,
      pageSize: 20,
      choices: SCANNABLE_COMPANIES.map(c => ({
        name: `${c.name}  ${chalk.gray(`(${c.api})`)}`,
        value: c.name
      })),
      validate: v => v.length > 0 || 'Pick at least one'
    }]);
    selectedCompanies = picked;
  }

  console.log(chalk.gray(`\n  Scanning for "${archetype}" roles...\n`));

  try {
    const scanner = new PortalScanner();
    const jobs = await scanner.scan(archetype, selectedCompanies);

    if (!jobs.length) {
      warn('No matching jobs found right now. Try again later or broaden the search.');
      await pressEnter();
      return;
    }

    section(`Found ${jobs.length} Roles`);
    jobs.forEach((job, i) => {
      console.log(chalk.cyan.bold(`\n  ${i + 1}. ${job.title || job.jobTitle}`));
      console.log(chalk.gray(`     Company:  `) + chalk.white(job.company));
      console.log(chalk.gray(`     Location: `) + chalk.white(job.location || 'India'));
      if (job.url) console.log(chalk.gray(`     URL:      `) + chalk.blue.underline(job.url));
      if (job.description) console.log(chalk.gray(`     Summary:  `) + chalk.white(job.description.slice(0, 120)));
    });

    let selected;
    if (jobs.length === 1) {
      selected = jobs[0];
      console.log(chalk.gray(`\n  Auto-selected the only result: `) + chalk.cyan.bold(selected.title));
    } else {
      const { jobChoice } = await inquirer.prompt([{
        type: 'list',
        name: 'jobChoice',
        message: 'Select a job:',
        pageSize: 12,
        choices: jobs.map((job, i) => ({
          name: `${i + 1}. ${job.title || job.jobTitle}  —  ${job.company}  (${job.location || 'India'})`,
          value: i
        }))
      }]);
      selected = jobs[jobChoice];
    }

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: `What do you want to do with: ${selected.title} @ ${selected.company}?`,
      choices: [
        { name: '🚀  Full workflow  (eval → prep → resume → apply)', value: 'full' },
        { name: '📊  Evaluate this job', value: 'evaluate' },
        { name: '🎯  Interview prep', value: 'prep' },
        { name: '📄  Generate resume', value: 'resume' },
        { name: '✅  Apply (save & open link)', value: 'apply' },
        { name: '↩  Back to main menu', value: 'back' }
      ]
    }]);

    // Build a rich text context so AI modules receive actual content, not just a URL
    const jobTitle = selected.title || selected.jobTitle || '';
    const jobDesc  = selected.description || '';
    const jobUrl   = selected.url || '';
    const jobInput = jobDesc
      ? `Position: ${jobTitle}\nCompany: ${selected.company}\nLocation: ${selected.location || 'India'}\n\n${jobDesc}\n\nJob URL: ${jobUrl}`
      : jobUrl;

    if (action === 'full') {
      try { await runEvaluateFlow(profile, jobInput); } catch (e) { err(`Evaluate failed: ${e.message}`); }
      try { await runInterviewPrepFlow(profile, jobInput); } catch (e) { err(`Prep failed: ${e.message}`); }
      try { await runResumeGenFlow(profile, jobInput); } catch (e) { err(`Resume failed: ${e.message}`); }
      await applyToJob(selected, profile);
    }
    if (action === 'evaluate') await runEvaluateFlow(profile, jobInput);
    if (action === 'prep') await runInterviewPrepFlow(profile, jobInput);
    if (action === 'resume') await runResumeGenFlow(profile, jobInput);
    if (action === 'apply') await applyToJob(selected, profile);
  } catch (e) {
    err(`Scan failed: ${e.message}`);
    await pressEnter();
  }
}

async function applyToJob(job, profile) {
  clear(); banner();
  section('Apply to Job');

  const applicationsPath = path.join(__dirname, '../../data/applications.json');
  if (!fs.existsSync(path.dirname(applicationsPath))) {
    fs.mkdirSync(path.dirname(applicationsPath), { recursive: true });
  }
  const applications = fs.existsSync(applicationsPath)
    ? JSON.parse(fs.readFileSync(applicationsPath, 'utf-8'))
    : [];

  const alreadyApplied = applications.find(a => a.url === job.url);
  if (alreadyApplied) {
    warn(`Already applied to this job on ${new Date(alreadyApplied.appliedAt).toLocaleDateString('en-IN')}`);
    await pressEnter();
    return;
  }

  console.log(chalk.white(`\n  Job:     `) + chalk.cyan.bold(job.title));
  console.log(chalk.white(`  Company: `) + chalk.white(job.company));
  console.log(chalk.white(`  URL:     `) + chalk.blue.underline(job.url));

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Mark this application as submitted?',
    default: true
  }]);

  if (!confirm) { await pressEnter(); return; }

  const application = {
    id: `app_${Date.now()}`,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    status: 'Applied',
    appliedAt: new Date().toISOString(),
    applicantName: profile?.name || 'Unknown',
  };

  applications.push(application);
  fs.writeFileSync(applicationsPath, JSON.stringify(applications, null, 2), 'utf-8');

  success(`Application saved! (ID: ${application.id})`);
  hint(`Open to apply manually: ${job.url}`);
  console.log(chalk.gray('\n  You can track this in Application Tracker.'));
  await pressEnter();
}

async function runApplicationTracker() {
  clear(); banner();
  section('Application Tracker');

  const evaluatedPath = path.join(__dirname, '../../data/evaluated-jobs.json');
  if (!fs.existsSync(evaluatedPath)) {
    warn('No evaluated jobs yet. Use "Evaluate a Job" to get started.');
    await pressEnter();
    return;
  }

  const jobs = JSON.parse(fs.readFileSync(evaluatedPath, 'utf-8'));
  if (!jobs.length) {
    warn('No evaluated jobs yet.');
    await pressEnter();
    return;
  }

  const sorted = [...jobs].sort((a, b) =>
    (b.evaluation?.overallScore || 0) - (a.evaluation?.overallScore || 0)
  );

  sorted.forEach((job, i) => {
    const score = job.evaluation?.overallScore || 0;
    const rec = job.evaluation?.recommendation || '?';
    const date = new Date(job.evaluatedAt).toLocaleDateString('en-IN');
    const recColor = rec === 'Apply' ? chalk.green : rec === 'Maybe' ? chalk.yellow : chalk.red;
    console.log(
      chalk.gray(`  ${(i + 1).toString().padStart(2)}. `) +
      scoreBar(score) +
      chalk.gray('  ') + recColor(rec.padEnd(7)) +
      chalk.gray(`  ${date}  `) +
      chalk.white((job.url || 'No URL').slice(0, 50))
    );
  });

  console.log(chalk.gray(`\n  Total evaluated: ${jobs.length}`));
  const applied = jobs.filter(j => (j.evaluation?.overallScore || 0) >= 4.0).length;
  console.log(chalk.gray(`  Strong matches (≥4.0): ${applied}`));

  await pressEnter();
}

async function runFullWorkflow(profile) {
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
    evaluation = await evaluator.evaluate(jobInput, profile);
    const score = evaluation.overallScore || 0;
    console.log('  Score: ' + scoreBar(score));
    const recMap = { Apply: chalk.green.bold, Maybe: chalk.yellow.bold, Skip: chalk.red.bold };
    const c = recMap[evaluation.recommendation] || chalk.white.bold;
    console.log('  Rec:   ' + c(evaluation.recommendation || '?'));

    if (score < 3.0) {
      warn('Score too low to continue. Consider a different role.');
      await pressEnter();
      return;
    }
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
      const plan = await prep.generatePrepPlan(jobInput, profile);
      console.log(prep.formatPrepPlanText(plan));
      success('Prep plan saved to data/interview-prep/');
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
      const { default: ResumeGenerator } = await import('../core/resumeGenerator.js');
      const gen = new ResumeGenerator();
      const result = await gen.generate(jobInput, profile);
      success(`Resume saved: ${result.path}`);
    } catch (e) { err(`Resume failed: ${e.message}`); }
  }

  section('All Done');
  console.log(chalk.green.bold('\n  ✓  Application package ready. Good luck! 🚀\n'));
  await pressEnter();
}

// ─── Main Menu ───────────────────────────────────────────────────────────────

async function mainMenu(profile) {
  while (true) {
    clear(); banner();
    showProfileSummary(profile);

    console.log();
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: 'What would you like to do?',
      pageSize: 35,
      choices: [
        { name: '🚀  Full Apply Workflow  (eval → prep → resume)', value: 'workflow' },
        new inquirer.Separator(),
        { name: '📊  Evaluate a Job', value: 'evaluate' },
        { name: '🏢  Scan Job Portals', value: 'scan' },
        { name: '🎯  Interview Prep', value: 'prep' },
        { name: '📄  Generate Resume', value: 'resume' },
        new inquirer.Separator(),
        { name: '📋  Application Tracker', value: 'tracker' },
        { name: '👤  Update Profile', value: 'profile' },
        { name: '⚙️   API Setup', value: 'setup' },
        new inquirer.Separator(),
        { name: '🚪  Exit', value: 'exit' }
      ]
    }]);

    switch (choice) {
      case 'workflow':  await runFullWorkflow(profile); break;
      case 'evaluate':  await runEvaluateFlow(profile); break;
      case 'scan':      await runScanFlow(profile); break;
      case 'prep':      await runInterviewPrepFlow(profile); break;
      case 'resume':    await runResumeGenFlow(profile); break;
      case 'tracker':   await runApplicationTracker(); break;
      case 'setup': {
        const { spawn } = await import('child_process');
        await new Promise(r => { const c = spawn('node', [path.join(__dirname, 'setupApiKey.js')], { stdio: 'inherit' }); c.on('close', r); });
        break;
      }
      case 'profile': {
        const { spawn } = await import('child_process');
        await new Promise(r => { const c = spawn('node', [path.join(__dirname, 'parseResume.js')], { stdio: 'inherit' }); c.on('close', r); });
        // Reload profile
        const { profile: p } = await getProfileStatus();
        if (p) profile = p;
        break;
      }
      case 'exit':
        console.log(chalk.cyan('\n  Good luck with your job search! 🎯\n'));
        process.exit(0);
    }

    // Reload profile after each action in case it was updated
    const refreshed = await profileManager.loadProfile();
    if (refreshed?.name) profile = refreshed;
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
  clear(); banner();

  const { profile, ready } = await getProfileStatus();

  if (!profile || !profile.name) {
    const ok = await runSetupFlow();
    if (!ok) process.exit(0);
    const { profile: p } = await getProfileStatus();
    if (p?.name) return mainMenu(p);
    process.exit(0);
  }

  if (!ready) {
    warn('Profile is incomplete. Some features may not work optimally.');
  }

  await mainMenu(profile);
}

main().catch(e => {
  console.error(chalk.red('\nFatal error:'), e.message);
  process.exit(1);
});
