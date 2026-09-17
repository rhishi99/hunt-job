#!/usr/bin/env node
/**
 * seed-profile.js — bootstrap config/profile.yml from the canonical resume.
 *
 * `npm run profile:init` writes an EMPTY scaffold (name: "Updated Name", no
 * archetypes, no techStack), which silently cripples job scoring and resume
 * tailoring — the evaluator prompt interpolates archetypes/techStack/salary
 * straight into the LLM call (jobEvaluator.js buildEvaluationPrompt).
 *
 * resumeData.js#defaultResumeData() already IS the canonical profile, so seed
 * from it rather than re-typing the data in a second place.
 *
 * Usage: npm run profile:seed [-- --force]
 * Refuses to clobber an already-complete profile unless --force is passed.
 */
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import { defaultResumeData } from '../src/core/resumeData.js';
import { isProfileComplete } from '../src/core/profileManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '..', 'config', 'profile.yml');

/** Maps the canonical resume shape onto the profile.yml shape. */
export function profileFromResume(resume, now = new Date().toISOString()) {
  return {
    name: resume.name,
    email: resume.contact.email,
    phone: resume.contact.phone,
    location: resume.contact.location,
    linkedin: resume.contact.linkedin,
    currentRole: resume.title,
    yearsOfExperience: 15,
    summary: resume.summary,
    archetypes: [
      'DevOps Engineer', 'Site Reliability Engineer', 'Platform Engineer',
      'Cloud Engineer', 'DevSecOps Engineer', 'Infrastructure Engineer',
    ],
    // NOTE: adjust to your real number — the evaluator scores salary alignment
    // against this range, so a wrong range silently skews every score.
    salary: { min: 40, max: 70, currency: 'INR', unit: 'LPA' },
    remotePreference: 'remote',
    techStack: resume.skills,
    skillGroups: resume.skillGroups,
    dealbreakers: [
      'No on-site-only role outside Pune/Mumbai/Bangalore',
      'No rotating night shift as the primary schedule',
      'No pure support/L1 ticket-queue role without engineering ownership',
      'No role without cloud or CI/CD ownership',
    ],
    experience: resume.experience.map(e => ({
      title: e.title, company: e.company, location: e.location,
      period: e.period, description: e.desc, highlights: e.bullets,
    })),
    education: resume.education,
    certifications: resume.certificates.map(c => ({ name: c.name, period: c.period, description: c.desc })),
    languages: resume.languages,
    projects: [],
    createdAt: now,
    updatedAt: now,
  };
}

function main() {
  const force = process.argv.includes('--force');

  if (fs.existsSync(PROFILE_PATH) && !force) {
    const existing = yaml.parse(fs.readFileSync(PROFILE_PATH, 'utf-8')) || {};
    if (isProfileComplete(existing).ok) {
      console.log('profile.yml already complete — pass --force to overwrite.');
      return;
    }
  }

  const profile = profileFromResume(defaultResumeData());
  fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_PATH, yaml.stringify(profile), 'utf-8');
  console.log(
    `Seeded ${PROFILE_PATH} — ${profile.archetypes.length} archetypes, ` +
    `${profile.techStack.length} skills, ${profile.experience.length} roles.`
  );
  console.log('Check config/profile.yml → salary range + dealbreakers before scanning.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
