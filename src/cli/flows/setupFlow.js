import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ProfileManager from '../../core/profileManager.js';
import { clear, banner, section, success, warn, err, hint, pressEnter } from '../ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileManager = new ProfileManager();

export async function getProfileStatus() {
  const profile = await profileManager.loadProfile();
  if (!profile || !profile.name) return { profile: null, ready: false };
  const ready = !!(profile.name && profile.email && profile.techStack?.length && profile.archetypes?.length);
  return { profile, ready };
}

export async function runSetupFlow() {
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
      const { parseResume } = await import('../parseResume.js').catch(() => null) ||
                               await import('../../core/resumeParser.js');

      if (typeof parseResume === 'function') {
        // Direct core call — launch the interactive parseResume CLI
        const { spawn } = await import('child_process');
        await new Promise((resolve, reject) => {
          const child = spawn('node', [
            path.join(__dirname, '../parseResume.js'),
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
      const child = spawn('node', [path.join(__dirname, '../profileInit.js')], { stdio: 'inherit' });
      child.on('close', resolve);
    });
  }

  return true;
}
