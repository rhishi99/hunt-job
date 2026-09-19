import 'dotenv/config';
import { readFileSync } from 'fs';
import { getActiveProviderName, getMinimumApplyScore } from './aiClient.js';
import { createLogger } from './logger.js';
import { getDb } from './db.js';
import { ensureJobRow, sha256 } from './pipeline/identity.js';
import { extractFacts } from './scoring/extract.js';
import { validateExtraction } from './scoring/validate.js';
import { scoreEvaluation, ensureScoreVersion } from './scoring/score.js';
import { buildNarrative } from './scoring/narrative.js';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('jobEvaluator');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const settings = JSON.parse(readFileSync(path.join(__dirname, '../../config/settings.json'), 'utf-8'));

// Extraction validity below this retries once on the 'heavy' tier (§3.2).
const EXTRACTION_VALIDITY_RETRY_FLOOR = 0.6;

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

function isUrlLike(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

// §2.4: reuse key is scoped to exactly the profile fields the scorer reads —
// changing an unrelated profile field (name, phone, summary...) must not
// invalidate every cached evaluation.
function computeProfileHash(profile) {
  const relevant = {
    archetypes: profile?.archetypes ?? null,
    rules: profile?.rules ?? null,
    techStack: profile?.techStack ?? null,
    skillGroups: profile?.skillGroups ?? null,
    salary: profile?.salary ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
  };
  return sha256(JSON.stringify(relevant));
}

// B-26: dimension keys are canonical — read from settings.json evaluation.dimensions
// (score.js's six component names) instead of whatever a model happened to name
// them, so bars/comparisons line up across evaluations regardless of provider.
function buildDimensions(componentScores) {
  const keys = settings.evaluation?.dimensions || Object.keys(componentScores);
  const dimensions = {};
  for (const key of keys) {
    const v = componentScores[key];
    if (v == null) continue;
    dimensions[key] = Math.round((1 + 4 * v) * 10) / 10; // 0..1 -> 1..5 scale, matching the legacy dimension bars
  }
  return dimensions;
}

class JobEvaluator {
  constructor() {
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

  /**
   * Scoring v2 (docs/fable51-answers.md §3): resolve job text -> reuse an
   * existing evaluation for the same (job_id, content_hash, profile_hash,
   * score_version) unless `fresh` (§2.4, B-18) -> else extract (the only LLM
   * call) -> validate -> score -> narrative, and persist the v5 evaluations
   * columns. `ensureJobRow` does the DB-first lookup by url/apply_url/
   * canonical_url before ever fetching (B-25) — a job already in the `jobs`
   * table is scored straight from its stored `description`.
   *
   * @param {string} jobInput - a URL or pasted job description text
   * @param {object} profile
   * @param {{fresh?: boolean, db?: import('better-sqlite3').Database}} [opts]
   */
  async evaluate(jobInput, profile, opts = {}) {
    const db = opts.db || getDb();
    const fresh = !!opts.fresh;
    log.op('evaluate_start', { input: jobInput.slice(0, 100), fresh });

    const jobId = await ensureJobRow(db, jobInput);
    const jobRow = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!jobRow) throw new Error(`evaluate: no jobs row for id ${jobId}`);

    const jobText = assertLongEnough(jobRow.description, 'Stored job description');
    const contentHash = jobRow.content_hash || sha256(jobText);
    const profileHash = computeProfileHash(profile);
    const scoreVersionRow = ensureScoreVersion(db);
    const scoreVersion = scoreVersionRow.version;
    const weights = JSON.parse(scoreVersionRow.weights);
    const minimumApplyScore = getMinimumApplyScore();

    if (!fresh) {
      const reused = db
        .prepare(
          `SELECT * FROM evaluations WHERE job_id = ? AND content_hash = ? AND profile_hash = ? AND score_version = ?
           ORDER BY evaluated_at DESC LIMIT 1`
        )
        .get(jobId, contentHash, profileHash, scoreVersion);
      if (reused) {
        log.op('evaluate_reused', { jobId, evaluationId: reused.id });
        return { evaluation: JSON.parse(reused.evaluation), id: reused.id, url: reused.url, jobId, reused: true };
      }
    }

    let { facts } = await extractFacts(jobText, { taskType: 'light' });
    let validated = validateExtraction(facts, jobText, profile);
    if (validated.extractionValidity < EXTRACTION_VALIDITY_RETRY_FLOOR) {
      try {
        const retry = await extractFacts(jobText, { taskType: 'heavy' });
        const retryValidated = validateExtraction(retry.facts, jobText, profile);
        if (retryValidated.extractionValidity >= validated.extractionValidity) {
          validated = retryValidated;
        }
      } catch (e) {
        log.op('evaluate_retry_extract_failed', { error: e.message });
      }
    }
    const lowConfidence = validated.extractionValidity < EXTRACTION_VALIDITY_RETRY_FLOOR;

    const scored = scoreEvaluation({
      facts: validated.facts,
      profile,
      skillCoverage: validated.skillCoverage,
      weights,
      postedAt: jobRow.posted_at,
      minimumApplyScore,
    });

    const narrative = buildNarrative({
      facts: validated.facts,
      skillCoverage: validated.skillCoverage,
      vetoed: scored.vetoed,
      vetoReason: scored.vetoReason,
      score: scored.score,
      coverage: scored.coverage,
    });

    const evaluation = {
      overallScore: scored.score,
      coverage: scored.coverage,
      dimensions: buildDimensions(scored.componentScores),
      matches: narrative.matches,
      mismatches: narrative.mismatches,
      reasoning: narrative.reasoning,
      recommendation: scored.recommendation,
      extractionValidity: validated.extractionValidity,
      lowConfidence,
      vetoed: scored.vetoed,
      vetoReason: scored.vetoReason,
      scoreVersion,
    };

    const evaluationId = `eval_${jobId}_${scoreVersion}_${Date.now()}`;
    const evaluatedAt = new Date().toISOString();
    const url = jobRow.url || (isUrlLike(jobInput) ? jobInput : null);
    const providerName = getActiveProviderName();

    // OR REPLACE: `--fresh` re-scores under the exact same (job_id, content_hash,
    // profile_hash, score_version) key the reuse lookup above would otherwise have
    // returned — that key is UNIQUE, so a fresh re-score replaces the prior row for
    // that key instead of colliding with it. Cross-key history (a changed JD, a new
    // score_version) is untouched; only an identical-key re-score is overwritten.
    db.prepare(
      `INSERT OR REPLACE INTO evaluations (
        id, url, evaluation, profile, evaluated_at,
        job_id, content_hash, profile_hash, model, extraction, score, score_version, recommendation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      evaluationId,
      url,
      JSON.stringify(evaluation),
      JSON.stringify({ archetypes: profile.archetypes, salaryRange: profile.salary }),
      evaluatedAt,
      jobId,
      contentHash,
      profileHash,
      providerName,
      JSON.stringify(validated.facts),
      scored.score,
      scoreVersion,
      scored.recommendation
    );

    log.op('evaluate_done', { score: scored.score, recommendation: scored.recommendation, jobId });

    return { evaluation, id: evaluationId, url, jobId, reused: false };
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
