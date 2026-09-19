// Extraction — the ONLY LLM call in evaluation. docs/fable51-answers.md §3.2.
//
// One prompt turns JD text into a facts JSON with an `evidence` quote per
// field. No résumé goes in this prompt — the candidate enters in code
// (validate.js / score.js), so the same extraction is reusable across score
// versions and the model only ever has to copy facts out of a document
// (comparable across free-tier providers, §3.5) instead of judging fit itself.
import { generateJSON } from '../aiClient.js';

const MAX_JD_CHARS = 12000;

/** Default shape with every field 'unstated'/null — the base `extractFacts` merges onto. */
export function emptyFacts() {
  return {
    role_title: { value: null, evidence: null },
    seniority: { value: 'unstated', evidence: null },
    years_required: { min: null, max: null, evidence: null },
    must_have_skills: [],
    nice_to_have_skills: [],
    responsibilities: [],
    location: { mode: 'unstated', cities: [], countries: [], evidence: null },
    salary: { min: null, max: null, currency: null, period: null, evidence: null },
    employment_type: { value: 'unstated', evidence: null },
    signals: {
      night_shift: false,
      rotational_shift: false,
      on_call: false,
      support_queue: false,
      presales: false,
      evidence: {},
    },
    role_nature: { value: 'unclear', evidence: null },
  };
}

/** Defensive merge: a partial/malformed LLM response can never crash validate/score downstream. */
export function mergeFacts(base, partial) {
  const out = JSON.parse(JSON.stringify(base));
  if (!partial || typeof partial !== 'object') return out;

  for (const key of Object.keys(base)) {
    const value = partial[key];
    if (value === undefined) continue;

    if (Array.isArray(base[key])) {
      out[key] = Array.isArray(value) ? value.filter(v => v && typeof v === 'object' ? true : typeof v === 'string') : base[key];
    } else if (base[key] && typeof base[key] === 'object') {
      out[key] = { ...base[key], ...(value && typeof value === 'object' ? value : {}) };
      if (key === 'signals') {
        out[key].evidence = { ...base[key].evidence, ...(value?.evidence && typeof value.evidence === 'object' ? value.evidence : {}) };
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function buildExtractionPrompt(jobText) {
  const truncated = jobText.length > MAX_JD_CHARS ? jobText.slice(0, MAX_JD_CHARS) : jobText;
  return `Extract structured facts from this job description. Every field with an "evidence" key must quote text that appears VERBATIM in the job description below — do not paraphrase, do not invent, do not use your own knowledge of the company. If a fact is not stated in the text, use "unstated" (for enum fields) or null (for numbers/strings/other enums) and evidence: null. Do not evaluate fit or mention a candidate — extract only what the posting itself says.

Job description:
"""
${truncated}
"""

Return ONLY a JSON object with exactly this shape (no markdown fences, no commentary):
{
  "role_title": {"value": string|null, "evidence": string|null},
  "seniority": {"value": "junior"|"mid"|"senior"|"staff"|"lead"|"manager"|"unstated", "evidence": string|null},
  "years_required": {"min": number|null, "max": number|null, "evidence": string|null},
  "must_have_skills": [{"value": string, "evidence": string}],
  "nice_to_have_skills": [{"value": string, "evidence": string}],
  "responsibilities": [string],
  "location": {"mode": "onsite"|"hybrid"|"remote"|"unstated", "cities": [string], "countries": [string], "evidence": string|null},
  "salary": {"min": number|null, "max": number|null, "currency": string|null, "period": string|null, "evidence": string|null},
  "employment_type": {"value": "full-time"|"part-time"|"contract"|"internship"|"temporary"|"unstated", "evidence": string|null},
  "signals": {"night_shift": boolean, "rotational_shift": boolean, "on_call": boolean, "support_queue": boolean, "presales": boolean, "evidence": {"<signal_name>": string}},
  "role_nature": {"value": "engineering_ownership"|"consulting"|"presales"|"support"|"unclear", "evidence": string|null}
}`;
}

/**
 * Runs the extraction prompt through the active provider and merges the
 * result onto `emptyFacts()` so a partial/missing field never breaks
 * downstream validation or scoring.
 *
 * @param {string} jobText
 * @param {{taskType?: 'light'|'heavy', maxTokens?: number, taskKind?: string}} [opts]
 * @returns {Promise<{facts: object, raw: string}>}
 */
export async function extractFacts(jobText, opts = {}) {
  const { taskType = 'light', maxTokens = 1500, taskKind = 'evaluate' } = opts;
  const prompt = buildExtractionPrompt(jobText);
  // Temperature is pinned to 0 here regardless of settings.claude.temperature:
  // extraction must be reproducible (§3.2) even if the interactive-eval
  // temperature default is tuned differently elsewhere.
  const { data, raw } = await generateJSON(prompt, { taskType, maxTokens, taskKind, temperature: 0 });
  return { facts: mergeFacts(emptyFacts(), data), raw };
}

export { MAX_JD_CHARS };
