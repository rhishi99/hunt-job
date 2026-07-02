import 'dotenv/config';
import { getActiveClient } from './aiClient.js';
import { createLogger } from './logger.js';
import { getDb } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('jobEvaluator');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

const FETCH_TIMEOUT_MS = 30000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MIN_JOB_TEXT_LENGTH = 200;

function stripHtml(html) {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pure URL classifier — no network — kept separate so it's cheaply testable.
function classifyJobInput(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!/^https?:\/\//i.test(value)) {
    return { type: 'text' };
  }
  const lever = value.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/i);
  if (lever) return { type: 'lever', company: lever[1], id: lever[2], url: value };

  const greenhouse = value.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i);
  if (greenhouse) return { type: 'greenhouse', board: greenhouse[1], id: greenhouse[2], url: value };

  return { type: 'generic', url: value };
}

function assertLongEnough(jobText, context) {
  if (!jobText || jobText.replace(/\s+/g, '').length < MIN_JOB_TEXT_LENGTH) {
    throw new Error(
      `${context} yielded too little text to evaluate. Please paste the job description text instead of a URL.`
    );
  }
  return jobText;
}

async function fetchLeverText({ company, id }) {
  const r = await fetch(`https://api.lever.co/v0/postings/${company}/${id}?mode=json`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Lever API returned ${r.status}`);
  const job = await r.json();
  const desc = stripHtml(job.description || '');
  return `Job Title: ${job.text}\nCompany: ${company}\nLocation: ${job.categories?.location || ''}\n\n${desc}`;
}

async function fetchGreenhouseText({ board, id }) {
  const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Greenhouse API returned ${r.status}`);
  const job = await r.json();
  const desc = stripHtml(job.content || '');
  return `Job Title: ${job.title || ''}\nLocation: ${job.location?.name || ''}\n\n${desc}`;
}

// Parses <script type="application/ld+json"> blocks looking for a JobPosting node.
function extractJsonLdJobPosting(html) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
      const posting = candidates.find(c => {
        const t = c?.['@type'];
        return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
      });
      if (posting) return posting;
    } catch {
      // not valid JSON in this block — try the next one
    }
  }
  return null;
}

async function fetchGenericText(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();

  const posting = extractJsonLdJobPosting(html);
  if (posting) {
    const org = posting.hiringOrganization?.name || '';
    const loc =
      (typeof posting.jobLocation === 'string' && posting.jobLocation) ||
      posting.jobLocation?.address?.addressLocality ||
      posting.jobLocation?.address?.addressRegion ||
      '';
    const desc = stripHtml(posting.description || '');
    return {
      jobText: `Job Title: ${posting.title || ''}\nCompany: ${org}\nLocation: ${loc}\n\n${desc}`,
      sourceType: 'jsonld',
    };
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return { jobText: stripHtml(body).slice(0, 8000), sourceType: 'html' };
}

/**
 * Resolves any evaluator input (pasted JD text, or a Lever/Greenhouse/generic URL)
 * into plain job text. Root cause of the P1 bug: this used to only handle Lever
 * URLs and silently passed every other URL straight to the LLM, which then
 * hallucinated an evaluation from the bare string. Every URL path here now either
 * returns real fetched text or throws — never a raw URL.
 */
async function resolveJobText(input) {
  const classification = classifyJobInput(input);

  if (classification.type === 'text') {
    log.op('resolve_job_text', { sourceType: 'text' });
    return { jobText: input, fetched: false, sourceType: 'text' };
  }

  if (classification.type === 'lever') {
    try {
      const jobText = assertLongEnough(await fetchLeverText(classification), 'Lever job posting');
      log.op('resolve_job_text', { sourceType: 'lever' });
      return { jobText, fetched: true, sourceType: 'lever' };
    } catch (e) {
      throw new Error(`Could not fetch Lever job posting (${e.message}). Please paste the job description text instead.`);
    }
  }

  if (classification.type === 'greenhouse') {
    try {
      const jobText = assertLongEnough(await fetchGreenhouseText(classification), 'Greenhouse job posting');
      log.op('resolve_job_text', { sourceType: 'greenhouse' });
      return { jobText, fetched: true, sourceType: 'greenhouse' };
    } catch (e) {
      throw new Error(`Could not fetch Greenhouse job posting (${e.message}). Please paste the job description text instead.`);
    }
  }

  try {
    const { jobText, sourceType } = await fetchGenericText(classification.url);
    assertLongEnough(jobText, 'Fetched page');
    log.op('resolve_job_text', { sourceType });
    return { jobText, fetched: true, sourceType };
  } catch (e) {
    throw new Error(`Could not fetch job posting from URL (${e.message}). Please paste the job description text instead.`);
  }
}

const CURRENCY_LABELS_LPA = new Set(['₹', 'INR', 'Rs', 'Rs.']);

function formatSalaryRange(salary) {
  const currency = salary?.currency ?? '₹';
  const unit = salary?.unit || (CURRENCY_LABELS_LPA.has(currency) ? 'LPA' : '');
  const min = salary?.min ?? 0;
  const max = salary?.max ?? 0;
  return `${currency}${min} - ${currency}${max}${unit ? ' ' + unit : ''}`;
}

class JobEvaluator {
  constructor() {
    this.client = getActiveClient('heavy');
    // kept for backward compat (tests/callers may reference this path); no longer used for I/O
    this.evaluatedJobsPath = path.join(dataDir, 'evaluated-jobs.json');
  }

  static buildEvaluationPrompt(jobText, profile) {
    const salaryLabel = formatSalaryRange(profile.salary);
    return `Please evaluate this job posting:

${jobText}

Candidate Profile:
- Target Archetypes: ${profile.archetypes?.join(', ')}
- Salary Range: ${salaryLabel}
- Tech Stack: ${profile.techStack?.join(', ')}
- Remote Preference: ${profile.remotePreference}
- Dealbreakers: ${profile.dealbreakers?.join(', ')}
- Years of Experience: ${profile.yearsOfExperience}

Please evaluate this job across these 10 dimensions on a scale of 1-5:
1. Salary Alignment
2. Tech Stack Compatibility
3. Company Culture Fit
4. Growth Opportunities
5. Location/Remote Requirements
6. Team Dynamics (if available)
7. Product Market Fit
8. Work-Life Balance Indicators
9. Career Progression Potential
10. Dealbreaker Compliance

For Salary Alignment, score against the candidate's stated range (${salaryLabel}) — convert any figure quoted in the posting to the candidate's currency before judging fit.

Provide the following as a JSON object with exactly these keys:
- "overallScore": number 1-5
- "dimensions": object with each dimension name as key and score 1-5 as value
- "matches": array of strings (what fits well)
- "mismatches": array of strings (what doesn't fit or is missing)
- "reasoning": string (2-3 sentences explaining the score)
- "recommendation": one of "Apply", "Maybe", or "Skip"

Return ONLY valid JSON, no markdown fences.`;
  }

  static parseEvaluationResponse(responseText) {
    try {
      const stripped = responseText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse evaluation as JSON, returning text:', e.message);
    }

    return {
      overallScore: 0,
      analysis: responseText,
      dimensions: {},
      recommendation: 'REVIEW'
    };
  }

  async evaluate(jobInput, profile) {
    log.op('evaluate_start', { input: jobInput.slice(0, 100) });

    const { jobText, fetched, sourceType } = await resolveJobText(jobInput);
    log.op('evaluate_source', { fetched, sourceType });

    const evaluationPrompt = JobEvaluator.buildEvaluationPrompt(jobText, profile);

    const response = await this.client.messages.create({
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: evaluationPrompt,
        },
      ],
    });

    const evaluation = JobEvaluator.parseEvaluationResponse(response.content[0].text);
    const savedJob = await this.saveEvaluatedJob(jobInput, evaluation, profile);
    log.op('evaluate_done', { score: evaluation.overallScore, recommendation: evaluation.recommendation });

    return { evaluation, id: savedJob.id, url: savedJob.url };
  }

  async saveEvaluatedJob(jobUrl, evaluation, profile) {
    const job = {
      id: `job_${Date.now()}`,
      url: jobUrl,
      evaluation,
      profile: {
        archetypes: profile.archetypes,
        salaryRange: profile.salary
      },
      evaluatedAt: new Date().toISOString()
    };

    getDb().prepare(`
      INSERT INTO evaluations (id, url, evaluation, profile, evaluated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(job.id, job.url, JSON.stringify(job.evaluation), JSON.stringify(job.profile), job.evaluatedAt);

    return job;
  }

  async getJobById(jobId) {
    const row = getDb().prepare('SELECT * FROM evaluations WHERE id = ?').get(jobId);
    return row ? rowToEvaluatedJob(row) : undefined;
  }

  async getEvaluatedJobs() {
    const rows = getDb().prepare('SELECT * FROM evaluations ORDER BY evaluated_at ASC').all();
    return rows.map(rowToEvaluatedJob);
  }
}

function rowToEvaluatedJob(row) {
  return {
    id: row.id,
    url: row.url,
    evaluation: JSON.parse(row.evaluation),
    profile: JSON.parse(row.profile || '{}'),
    evaluatedAt: row.evaluated_at,
  };
}

export default JobEvaluator;

export { JobEvaluator, classifyJobInput, resolveJobText, formatSalaryRange };
