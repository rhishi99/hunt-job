#!/usr/bin/env node
import inquirer from 'inquirer';
import ProfileManager from '../core/profileManager.js';
import chalk from 'chalk';
import 'dotenv/config';

const profileManager = new ProfileManager();

function section(title) {
  console.log('\n' + chalk.cyan.bold(`── ${title} `) + chalk.cyan('─'.repeat(Math.max(0, 40 - title.length))));
}

async function editProfile() {
  console.log(chalk.cyan.bold('\n👤  Edit Profile\n'));

  const existing = await profileManager.loadProfile();
  if (!existing || !existing.name) {
    console.log(chalk.yellow('  No profile found. Run: npm run profile:init\n'));
    process.exit(1);
  }

  section('Current Profile');
  console.log(chalk.gray(`  Name        : ${existing.name}`));
  console.log(chalk.gray(`  Email       : ${existing.email}`));
  console.log(chalk.gray(`  Role        : ${existing.currentRole}`));
  console.log(chalk.gray(`  Experience  : ${existing.yearsOfExperience} years`));
  console.log(chalk.gray(`  CTC Range   : ${existing.salary?.min}–${existing.salary?.max} LPA`));
  console.log(chalk.gray(`  Archetypes  : ${(existing.archetypes || []).join(', ')}`));
  console.log(chalk.gray(`  Tech Stack  : ${(existing.techStack || []).join(', ')}`));
  console.log(chalk.gray(`  Remote      : ${existing.remotePreference}`));
  console.log(chalk.gray(`  Dealbreakers: ${(existing.dealbreakers || []).join(', ')}`));

  const { section: editSection } = await inquirer.prompt([{
    type: 'list',
    name: 'section',
    message: '\nWhat do you want to edit?',
    choices: [
      { name: '📝  Basic Info (name, email, phone, role, years)', value: 'basic' },
      { name: '🎯  Archetypes & Salary', value: 'target' },
      { name: '🛠   Tech Stack', value: 'techstack' },
      { name: '🚫  Dealbreakers', value: 'dealbreakers' },
      { name: '💼  Work Mode (remote/hybrid/onsite)', value: 'workmode' },
      { name: '📋  Add Work Experience', value: 'experience' },
      { name: '🔄  Re-run full profile setup (overwrites everything)', value: 'reinit' },
      { name: '↩  Exit without changes', value: 'exit' },
    ]
  }]);

  if (editSection === 'exit') {
    console.log(chalk.gray('\n  No changes made.\n'));
    process.exit(0);
  }

  if (editSection === 'reinit') {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm', name: 'confirm',
      message: 'This will overwrite your current profile. Continue?', default: false
    }]);
    if (confirm) {
      const { spawn } = await import('child_process');
      const { fileURLToPath } = await import('url');
      const path = await import('path');
      const __dirname = path.default.dirname(fileURLToPath(import.meta.url));
      await new Promise(r => {
        const c = spawn('node', [path.default.join(__dirname, 'profileInit.js')], { stdio: 'inherit' });
        c.on('close', r);
      });
    }
    process.exit(0);
  }

  let updated = { ...existing };

  if (editSection === 'basic') {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Full name:', default: existing.name },
      { type: 'input', name: 'email', message: 'Email:', default: existing.email },
      { type: 'input', name: 'phone', message: 'Phone:', default: existing.phone || '' },
      { type: 'input', name: 'currentRole', message: 'Current role:', default: existing.currentRole },
      { type: 'number', name: 'yearsOfExperience', message: 'Years of experience:', default: existing.yearsOfExperience || 0 },
      { type: 'input', name: 'location', message: 'Location (city):', default: existing.location || '' },
    ]);
    updated = { ...updated, ...answers };
  }

  if (editSection === 'target') {
    const archetypeChoices = [
      'Software Engineer', 'Backend Engineer', 'Frontend Engineer', 'Full Stack Engineer',
      'Data Engineer', 'ML Engineer', 'DevOps Engineer', 'Cloud Engineer',
      'Platform Engineer', 'Site Reliability Engineer', 'Security Engineer',
      'Product Manager', 'Engineering Manager', 'Other'
    ];
    const answers = await inquirer.prompt([
      {
        type: 'checkbox', name: 'archetypes', message: 'Target archetypes (select all that apply):',
        choices: archetypeChoices.map(a => ({ name: a, value: a, checked: (existing.archetypes || []).includes(a) })),
        validate: v => v.length > 0 || 'Select at least one'
      },
      { type: 'number', name: 'salaryMin', message: 'Minimum CTC (LPA):', default: existing.salary?.min || 10 },
      { type: 'number', name: 'salaryMax', message: 'Maximum CTC (LPA):', default: existing.salary?.max || 25 },
    ]);
    updated.archetypes = answers.archetypes;
    updated.salary = { ...existing.salary, min: answers.salaryMin, max: answers.salaryMax, currency: 'INR', unit: 'LPA' };
  }

  if (editSection === 'techstack') {
    const current = (existing.techStack || []).join(', ');
    const { techStack } = await inquirer.prompt([{
      type: 'input', name: 'techStack',
      message: 'Tech stack (comma-separated):',
      default: current
    }]);
    updated.techStack = techStack.split(',').map(t => t.trim()).filter(Boolean);
  }

  if (editSection === 'dealbreakers') {
    const current = (existing.dealbreakers || []).join(', ');
    const { dealbreakers } = await inquirer.prompt([{
      type: 'input', name: 'dealbreakers',
      message: 'Dealbreakers (comma-separated, e.g. "no remote,bond period"):',
      default: current
    }]);
    updated.dealbreakers = dealbreakers.split(',').map(d => d.trim()).filter(Boolean);
  }

  if (editSection === 'workmode') {
    const { remotePreference } = await inquirer.prompt([{
      type: 'list', name: 'remotePreference',
      message: 'Work mode preference:',
      choices: ['Remote', 'Hybrid', 'On-site', 'Flexible'],
      default: existing.remotePreference || 'Hybrid'
    }]);
    updated.remotePreference = remotePreference;
  }

  if (editSection === 'experience') {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'title', message: 'Job title:', validate: v => v.length > 0 || 'Required' },
      { type: 'input', name: 'company', message: 'Company:', validate: v => v.length > 0 || 'Required' },
      { type: 'input', name: 'startDate', message: 'Start date (YYYY-MM):', default: '2022-01' },
      { type: 'input', name: 'endDate', message: 'End date (YYYY-MM or "Present"):', default: 'Present' },
      { type: 'input', name: 'description', message: 'Key achievements (one line summary):' },
    ]);
    updated.experience = [...(existing.experience || []), {
      title: answers.title,
      company: answers.company,
      startDate: answers.startDate,
      endDate: answers.endDate,
      description: answers.description
    }];
  }

  updated.updatedAt = new Date().toISOString();
  await profileManager.saveProfile(updated);

  console.log(chalk.green.bold('\n  ✅  Profile updated successfully!\n'));
}

editProfile().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
