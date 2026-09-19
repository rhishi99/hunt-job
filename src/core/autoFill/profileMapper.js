/**
 * profileMapper.js
 * Converts the raw profile YAML into a flat fieldValues map with 25+ entries
 * ready for form filling. Also generates AI content (cover letter, summary)
 * before the browser opens.
 */

import { getActiveClient } from '../aiClient.js';
import { getDb } from '../db.js';
import { findJobDocument } from '../jobDocs.js';

/**
 * B-03: the résumé PDF generated FOR THIS JOB, from the `documents` table.
 * Never guesses "newest file" — no job PDF returns null and the caller warns.
 * @param {{jobId?: string|null, url?: string|null, db?: object}} ref
 * @returns {string|null} absolute path
 */
export function findJobResumePdf({ jobId = null, url = null, db = null } = {}) {
  try {
    const found = findJobDocument(db || getDb(), { jobId, url, type: 'resume' });
    return found ? found.path : null;
  } catch {
    return null;
  }
}

// ── Custom-question answers (B-30) ────────────────────────────────────────────

const str = v => (v == null ? '' : String(v).trim());

/**
 * Personal facts for application questions, from the profile's
 * `applicationAnswers:` block (legacy top-level keys still honoured).
 * Every key is '' unless the user supplied it — nothing is guessed.
 */
export function buildAnswers(profile = {}) {
  const a = profile.applicationAnswers || {};
  return {
    country: str(a.country ?? profile.country),
    noticePeriod: str(a.noticePeriod ?? profile.noticePeriod ?? profile.notice_period),
    currentCtc: str(a.currentCtc),
    expectedCtc: str(a.expectedCtc),
    workAuthorization: str(a.workAuthorization ?? profile.workAuthorization ?? profile.work_authorization),
    needsSponsorship: str(a.needsSponsorship),
    relocate: str(a.relocate),
  };
}

// First match wins; order matters (current/expected CTC before generic salary).
const QUESTION_RULES = [
  { key: 'currentCtc', re: /(current|present).{0,30}(ctc|salary|compensation|pay)|(ctc|salary|compensation).{0,20}current/i },
  { key: 'expectedCtc', re: /(expected|desired|target).{0,30}(ctc|salary|compensation|pay)|salary expectation|(ctc|salary|compensation).{0,20}expect/i },
  { key: 'noticePeriod', re: /notice\s*period|how soon.{0,20}(join|start)|earliest.{0,20}start/i },
  { key: 'needsSponsorship', re: /sponsor|require.{0,20}visa/i },
  { key: 'workAuthorization', re: /(authori[sz]ed|legally|eligible|right).{0,25}work|work\s*authori[sz]ation/i },
  { key: 'relocate', re: /relocat/i },
  { key: 'country', re: /\bcountry\b/i },
];

/** Answer for one form question's label, or '' when unknown (leave for the user). */
export function answerForQuestion(label, answers) {
  const text = str(label);
  if (!text || !answers) return '';
  for (const { key, re } of QUESTION_RULES) {
    if (re.test(text)) return answers[key] || '';
  }
  return '';
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
 * @param {string} [options.jobId] / [options.jobUrl] — locate this job's own résumé PDF (B-03)
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

  // B-30: personal facts (notice period, CTC, work authorization…) come only from
  // what the user wrote in the profile — never a guessed default.
  const answers = buildAnswers(profile);
  const noticePeriod = answers.noticePeriod;
  const workAuth = answers.workAuthorization;

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

    // Custom-question answers (B-30) — see answerForQuestion()
    answers,

    // AI-generated (populated below if enabled)
    coverLetter:      '',
    summary:          '',

    // Resume path (for file upload)
    resumePath:       options.resumePath || findJobResumePdf({ jobId: options.jobId, url: options.jobUrl, db: options.db }) || '',
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
