#!/usr/bin/env node
import 'dotenv/config';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import { parseResume } from '../core/resumeParser.js';
import ProfileManager from '../core/profileManager.js';

const profileManager = new ProfileManager();

const ARCHETYPES = [
  'Software Engineer', 'Data Engineer', 'Product Manager', 'ML Engineer',
  'DevOps Engineer', 'Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer',
  'Data Analyst', 'Cloud Engineer', 'SRE', 'QA Engineer', 'Other'
];

async function confirmAndEdit(parsed) {
  console.log(chalk.cyan.bold('\n📋 Extracted Profile Data\n'));
  console.log(chalk.white(`Name:           ${chalk.yellow(parsed.name || 'Not found')}`));
  console.log(chalk.white(`Email:          ${chalk.yellow(parsed.email || 'Not found')}`));
  console.log(chalk.white(`Phone:          ${chalk.yellow(parsed.phone || 'Not found')}`));
  console.log(chalk.white(`Current Role:   ${chalk.yellow(parsed.currentRole || 'Not found')}`));
  console.log(chalk.white(`Experience:     ${chalk.yellow((parsed.yearsOfExperience || 0) + ' years')}`));
  console.log(chalk.white(`Location:       ${chalk.yellow(parsed.location || 'Not found')}`));
  console.log(chalk.white(`Tech Stack:     ${chalk.yellow((parsed.techStack || []).slice(0, 8).join(', ') + (parsed.techStack?.length > 8 ? '...' : ''))}`));
  console.log(chalk.white(`Archetypes:     ${chalk.yellow((parsed.suggestedArchetypes || []).join(', '))}`));
  console.log(chalk.white(`Experience:     ${chalk.yellow((parsed.experience || []).length + ' roles')}`));
  console.log(chalk.white(`Education:      ${chalk.yellow((parsed.education || []).length + ' entries')}`));
  console.log(chalk.white(`Projects:       ${chalk.yellow((parsed.projects || []).length + ' projects')}`));
  console.log();

  const { proceed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'proceed',
    message: 'Does this look correct? (You can adjust preferences next)',
    default: true
  }]);

  if (!proceed) {
    console.log(chalk.yellow('Aborting. Please check your PDF and try again.'));
    process.exit(0);
  }

  // Let user confirm/override key fields
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Full name:',
      default: parsed.name || '',
      validate: v => v.length > 0 || 'Required'
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email:',
      default: parsed.email || '',
      validate: v => v.includes('@') || 'Enter a valid email'
    },
    {
      type: 'input',
      name: 'phone',
      message: 'Phone:',
      default: parsed.phone || ''
    },
    {
      type: 'input',
      name: 'currentRole',
      message: 'Current role:',
      default: parsed.currentRole || '',
      validate: v => v.length > 0 || 'Required'
    },
    {
      type: 'number',
      name: 'yearsOfExperience',
      message: 'Years of experience:',
      default: parsed.yearsOfExperience || 0
    },
    {
      type: 'input',
      name: 'location',
      message: 'Current city/location:',
      default: parsed.location || ''
    },
    {
      type: 'checkbox',
      name: 'archetypes',
      message: 'Target job archetypes:',
      choices: ARCHETYPES,
      default: (parsed.suggestedArchetypes || []).filter(a => ARCHETYPES.includes(a)),
      validate: v => v.length > 0 || 'Select at least one'
    },
    {
      type: 'number',
      name: 'salaryMinLPA',
      message: 'Minimum expected CTC (in LPA — Lakhs Per Annum):',
      default: parsed.currentSalaryLPA ? Math.round(parsed.currentSalaryLPA * 1.2) : 10
    },
    {
      type: 'number',
      name: 'salaryMaxLPA',
      message: 'Maximum expected CTC (in LPA):',
      default: parsed.currentSalaryLPA ? Math.round(parsed.currentSalaryLPA * 1.5) : 20
    },
    {
      type: 'list',
      name: 'remotePreference',
      message: 'Work mode preference:',
      choices: ['Remote', 'Hybrid', 'On-site', 'Flexible'],
      default: 'Hybrid'
    },
    {
      type: 'input',
      name: 'dealbreakers',
      message: 'Dealbreakers (comma-separated, e.g. "bond, relocation, night shifts"):',
      default: ''
    }
  ]);

  return answers;
}

async function main() {
  const pdfPath = process.argv[2] || '/cowork/Rhishi_Resume.pdf';
  const resolvedPath = path.resolve(pdfPath);

  console.log(chalk.cyan.bold('\n🔍 Career-Ops Resume Parser\n'));
  console.log(chalk.white(`Parsing: ${chalk.yellow(resolvedPath)}\n`));

  if (!process.env.GEMINI_API_KEY) {
    console.error(chalk.red('Error: GEMINI_API_KEY not set. Run: npm run setup'));
    process.exit(1);
  }

  console.log(chalk.gray('Extracting text from PDF...'));

  let parsed, rawText;
  try {
    ({ parsed, rawText } = await parseResume(resolvedPath));
  } catch (err) {
    console.error(chalk.red('\nFailed to parse resume:'), err.message);
    process.exit(1);
  }

  console.log(chalk.green('✓ Resume parsed successfully via Claude AI\n'));

  const answers = await confirmAndEdit(parsed);

  const profile = {
    name: answers.name,
    email: answers.email,
    phone: answers.phone,
    currentRole: answers.currentRole,
    yearsOfExperience: answers.yearsOfExperience,
    location: answers.location,
    linkedin: parsed.linkedin || '',
    github: parsed.github || '',
    archetypes: answers.archetypes,
    salary: {
      min: answers.salaryMinLPA,
      max: answers.salaryMaxLPA,
      currency: 'INR',
      unit: 'LPA'
    },
    remotePreference: answers.remotePreference,
    techStack: parsed.techStack || [],
    skills: parsed.skills || [],
    dealbreakers: answers.dealbreakers.split(',').map(d => d.trim()).filter(d => d),
    experience: parsed.experience || [],
    education: parsed.education || [],
    projects: parsed.projects || [],
    certifications: parsed.certifications || [],
    summary: parsed.summary || '',
    resumePath: resolvedPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await profileManager.saveProfile(profile);

  console.log(chalk.green.bold('\n✅ Profile saved successfully!\n'));
  console.log(chalk.cyan('Next steps:'));
  console.log('  Evaluate a job:   npm run evaluate-job -- <URL>');
  console.log('  Scan portals:     npm run scan-portals -- --archetype "Data Engineer"');
  console.log('  Generate resume:  npm run generate-resume -- --job-id <id>');
  console.log('  Interview prep:   npm run prepare-interview -- <job-description>\n');
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
