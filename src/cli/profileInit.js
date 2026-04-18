#!/usr/bin/env node
import inquirer from 'inquirer';
import ProfileManager from '../core/profileManager.js';
import chalk from 'chalk';

const profileManager = new ProfileManager();

async function initProfile() {
  console.log(chalk.cyan.bold('\n🚀 Career-Ops Profile Setup\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Your full name:',
      validate: (val) => val.length > 0 || 'Please enter your name'
    },
    {
      type: 'input',
      name: 'email',
      message: 'Your email:',
      validate: (val) => val.includes('@') || 'Please enter a valid email'
    },
    {
      type: 'input',
      name: 'phone',
      message: 'Your phone number (optional):'
    },
    {
      type: 'input',
      name: 'currentRole',
      message: 'Your current role:',
      validate: (val) => val.length > 0 || 'Please enter your current role'
    },
    {
      type: 'number',
      name: 'yearsOfExperience',
      message: 'Years of experience:',
      default: 0
    },
    {
      type: 'checkbox',
      name: 'archetypes',
      message: 'Target job archetypes (select at least one):',
      choices: [
        'Software Engineer',
        'Data Engineer',
        'Product Manager',
        'ML Engineer',
        'DevOps Engineer',
        'Frontend Engineer',
        'Backend Engineer',
        'Full Stack Engineer',
        'Other'
      ],
      validate: (val) => val.length > 0 || 'Please select at least one archetype'
    },
    {
      type: 'number',
      name: 'salaryMin',
      message: 'Minimum CTC expectation (in LPA — Lakhs Per Annum):',
      default: 10
    },
    {
      type: 'number',
      name: 'salaryMax',
      message: 'Maximum CTC expectation (in LPA):',
      default: 20
    },
    {
      type: 'list',
      name: 'remotePreference',
      message: 'Remote preference:',
      choices: ['Remote', 'Hybrid', 'On-site', 'Flexible'],
      default: 'Hybrid'
    },
    {
      type: 'input',
      name: 'techStack',
      message: 'Preferred tech stack (comma-separated):'
    },
    {
      type: 'input',
      name: 'dealbreakers',
      message: 'Dealbreakers (comma-separated, optional):'
    }
  ]);

  const profile = {
    name: answers.name,
    email: answers.email,
    phone: answers.phone,
    currentRole: answers.currentRole,
    yearsOfExperience: answers.yearsOfExperience,
    archetypes: answers.archetypes,
    salary: {
      min: answers.salaryMin,
      max: answers.salaryMax,
      currency: 'INR',
      unit: 'LPA'
    },
    remotePreference: answers.remotePreference,
    techStack: answers.techStack.split(',').map(t => t.trim()).filter(t => t),
    dealbreakers: answers.dealbreakers.split(',').map(d => d.trim()).filter(d => d),
    experience: [],
    education: [],
    projects: [],
    skills: [],
    certifications: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await profileManager.saveProfile(profile);

  console.log(chalk.green.bold('\n✅ Profile created successfully!\n'));
  console.log(chalk.cyan('Next steps:'));
  console.log('1. Add your experience: npm run profile:edit -- --add-experience');
  console.log('2. Evaluate your first job: npm run evaluate-job -- <URL>');
  console.log('3. Scan job portals: npm run scan-portals -- --archetype "Data Engineer"\n');
}

initProfile().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
