#!/usr/bin/env node
import 'dotenv/config';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import ProfileManager from '../core/profileManager.js';
import { closeDb } from '../core/db.js';
import { clear, banner, warn, success, hint, pressEnter, showProfileSummary } from './ui.js';
// Hunt-Job interactive menu (uses modern Hunt-Job banner from ui.js)
import { runSetupFlow, getProfileStatus } from './flows/setupFlow.js';
import { runEvaluateFlow } from './flows/evaluateFlow.js';
import { runScanFlow } from './flows/scanFlow.js';
import { runInterviewPrepFlow } from './flows/prepFlow.js';
import { runResumeGenFlow } from './flows/resumeFlow.js';
import { runApplicationTracker } from './flows/applyFlow.js';
import { runFullWorkflow } from './flows/huntFlow.js';
import { runBrowseFlow } from './flows/browseFlow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileManager = new ProfileManager();

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
        { name: '🏢  Scan Job Portals  (live)', value: 'scan' },
        { name: '🔎  Browse Saved Jobs  (instant)', value: 'browse' },
        { name: '🎯  Interview Prep', value: 'prep' },
        { name: '📄  Generate Resume', value: 'resume' },
        new inquirer.Separator(),
        { name: '📋  Application Tracker', value: 'tracker' },
        { name: '🖥️   Web Dashboard', value: 'dashboard' },
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
      case 'browse':    await runBrowseFlow(profile); break;
      case 'prep':      await runInterviewPrepFlow(profile); break;
      case 'resume':    await runResumeGenFlow(profile); break;
      case 'tracker':   await runApplicationTracker(); break;
      case 'dashboard': {
        const { spawn } = await import('child_process');
        const port = process.env.HUNT_JOB_PORT || 7777;
        // ponytail: fire-and-forget background process, not a supervised service — simplest thing that doesn't hang the menu
        const child = spawn('node', [path.join(__dirname, '..', 'web', 'server.js')], { stdio: 'ignore', detached: true, shell: true });
        child.unref();
        success(`Dashboard starting at http://127.0.0.1:${port}`);
        hint(`It keeps running in the background. Close its node process (Task Manager) or the terminal to stop it.`);
        await pressEnter();
        break;
      }
      case 'setup': {
        const { spawn } = await import('child_process');
        await new Promise(r => { const c = spawn('node', [path.join(__dirname, 'setupApiKey.js')], { stdio: 'inherit' }); c.on('close', r); });
        break;
      }
      case 'profile': {
        const { spawn } = await import('child_process');
        await new Promise(r => { const c = spawn('node', [path.join(__dirname, 'profileEdit.js')], { stdio: 'inherit' }); c.on('close', r); });
        // Reload profile
        const { profile: p } = await getProfileStatus();
        if (p) profile = p;
        break;
      }
      case 'exit':
        closeDb();
        console.log(chalk.cyan('\n  Good luck with your job search! 🎯\n'));
        process.exit(0);
    }

    // Reload profile after each action in case it was updated
    const refreshed = await profileManager.loadProfile();
    if (refreshed?.name) profile = refreshed;
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

process.on('SIGINT', () => { closeDb(); process.exit(0); });

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
