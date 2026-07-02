/**
 * profileMapper.js
 * Converts the raw profile YAML into a flat fieldValues map with 25+ entries
 * ready for form filling. Also generates AI content (cover letter, summary)
 * before the browser opens.
 */

import { getActiveClient } from '../aiClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the most recently generated resume PDF in data/resumes/.
 * Returns absolute path or null if none found.
 */
export function findLatestResumePdf() {
  const resumeDir = path.join(__dirname, '../../../data/resumes');
  if (!fs.existsSync(resumeDir)) return null;
  const pdfs = fs.readdirSync(resumeDir)
    .filter(f => f.endsWith('.pdf'))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(resumeDir, f)).mtimeMs,
      fullPath: path.join(resumeDir, f),
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return pdfs.length ? pdfs[0].fullPath : null;
}

/**
 * AI-generate a short cover letter (≤180 words) tailored to the job.
 * Falls back gracefully on AI errors.
 */
async function generateCoverLetter(profile, jobContext) {
  try {
    const client = getActiveClient('light');
    const exp = (profile.experience || []).slice(0, 2)
      .map(e => `${e.title} at ${e.company}`)
      .join(', ');

    const prompt = `Write a concise, professional cover letter (max 150 words, no boilerplate "Dear Hiring Manager" opener needed — start directly with your value proposition).

Candidate: ${profile.name}, ${profile.currentRole || 'Software Professional'}, ${profile.yearsOfExperience || 0} years experience.
Recent experience: ${exp || 'Various tech roles'}.
Top skills: ${(profile.techStack || []).slice(0, 6).join(', ')}.
Job context: ${(jobContext || '').slice(0, 400)}

Output ONLY the cover letter text, no subject line, no date.`;

    const response = await client.messages.create({
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * AI-generate a professional summary (2–3 sentences) for "About You" fields.
 */
async function generateSummary(profile) {
  try {
    const client = getActiveClient('light');
    const prompt = `Write a 2-sentence professional summary for a job application "About Yourself" field.

Name: ${profile.name}, Role: ${profile.currentRole || 'Software Professional'}, Experience: ${profile.yearsOfExperience || 0} years.
Skills: ${(profile.techStack || []).slice(0, 8).join(', ')}.
Output ONLY the summary text.`;

    const response = await client.messages.create({
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Build a complete flat fieldValues map from profile + optional job context.
 * @param {object} profile  — from ProfileManager.loadProfile()
 * @param {string} jobContext — job title + description text (used for cover letter)
 * @param {object} options
 * @param {boolean} options.generateAIContent — if true, generates cover letter + summary via AI
 * @returns {Promise<object>} fieldValues
 */
export async function buildFieldValues(profile, jobContext = '', options = {}) {
  const { generateAIContent = true } = options;

  const nameParts = (profile.name || '').trim().split(/\s+/);
  const firstName  = nameParts[0] || '';
  const lastName   = nameParts.slice(1).join(' ') || '';
  const fullName   = profile.name || '';

  const recentExp   = (profile.experience || [])[0] || {};
  const recentEdu   = (profile.education  || [])[0] || {};

  // Salary: convert to a reasonable string
  const salaryStr = profile.salary?.min
    ? `${profile.salary.min} LPA`
    : '';

  // Notice period — check profile for explicit field, or guess from experience
  const noticePeriod = profile.noticePeriod || profile.notice_period || '30 days';

  // Work authorization
  const workAuth = profile.workAuthorization || profile.work_authorization || 'Authorized to work in India';

  // Skills as comma-separated string (for single textarea/input)
  const skillsStr = [
    ...(profile.techStack || []),
    ...(profile.skills    || []),
  ].filter(Boolean).slice(0, 15).join(', ');

  // Education
  const degreeStr = recentEdu.degree
    ? `${recentEdu.degree}${recentEdu.field ? ' in ' + recentEdu.field : ''}`
    : '';

  const fieldValues = {
    // Identity
    firstName,
    lastName,
    fullName,
    email:            profile.email         || '',
    phone:            profile.phone         || '',

    // Social / Links
    linkedin:         profile.linkedin       || '',
    github:           profile.github         || '',
    website:          profile.website        || profile.portfolio || '',
    twitter:          profile.twitter        || '',

    // Current employment
    currentTitle:     profile.currentRole    || '',
    currentCompany:   recentExp.company      || '',
    location:         profile.location       || '',

    // Numeric / structured
    yearsOfExperience: String(profile.yearsOfExperience || ''),
    salaryExpectation: salaryStr,
    noticePeriod,
    workAuthorization: workAuth,

    // Education
    educationDegree:  degreeStr,
    educationSchool:  recentEdu.school       || recentEdu.institution || '',
    educationYear:    String(recentEdu.year  || recentEdu.endYear || ''),
    educationField:   recentEdu.field        || '',

    // Skills
    skills:           skillsStr,

    // AI-generated (populated below if enabled)
    coverLetter:      '',
    summary:          '',

    // Resume path (for file upload)
    resumePath:       findLatestResumePdf() || '',
  };

  if (generateAIContent) {
    // Run both in parallel to save time
    const [cl, summ] = await Promise.all([
      generateCoverLetter(profile, jobContext),
      generateSummary(profile),
    ]);
    fieldValues.coverLetter = cl;
    fieldValues.summary     = summ;
  }

  return fieldValues;
}
