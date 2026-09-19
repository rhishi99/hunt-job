// Extraction validation — docs/fable51-answers.md §3.2.
//
// Two independent checks, both deterministic (no LLM):
//  1. Evidence-in-JD: every quoted "evidence" string must appear verbatim
//     (whitespace/case normalized) in the job text, or the field it backs is
//     reset to 'unstated'/dropped. This is what makes a hallucinated fact
//     visible instead of silently scored.
//  2. Skill grounding against the candidate profile: which must-have /
//     nice-to-have skills the candidate's lexicon (techStack + skillGroups +
//     experience bullets) actually covers. score.js consumes this directly
//     instead of re-deriving it, so there is one place that knows what
//     "covered" means.

// k8s -> kubernetes, ci/cd -> cicd, etc. Both the extracted skill values and
// the candidate lexicon are normalized through this before comparison.
export const SKILL_ALIASES = {
  k8s: 'kubernetes',
  'ci/cd': 'cicd',
  'ci-cd': 'cicd',
  cicd: 'cicd',
  'continuous integration': 'cicd',
  'continuous deployment': 'cicd',
  'continuous delivery': 'cicd',
  iac: 'infrastructure as code',
  'infra as code': 'infrastructure as code',
  aws: 'aws',
  'amazon web services': 'aws',
  gcp: 'gcp',
  'google cloud': 'gcp',
  'google cloud platform': 'gcp',
  azure: 'azure',
  'microsoft azure': 'azure',
  tf: 'terraform',
  js: 'javascript',
  ts: 'typescript',
  k8: 'kubernetes',
};

export function normalizeSkill(value) {
  const lower = String(value || '').trim().toLowerCase();
  return SKILL_ALIASES[lower] || lower;
}

/** Collapses whitespace/case so a quoted evidence string always compares the same way. */
export function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function evidenceAppearsInText(evidence, jobText) {
  const needle = normalizeText(evidence);
  if (!needle) return false;
  return normalizeText(jobText).includes(needle);
}

/**
 * Builds the candidate's skill lexicon from the profile: an exact/alias
 * token set (techStack + skillGroups) plus a joined blob of experience
 * bullet text for multi-word phrases ("system design") that only ever show
 * up in prose, never as a discrete techStack entry.
 */
export function buildCandidateLexicon(profile) {
  const tokens = new Set();
  for (const t of profile?.techStack || []) tokens.add(normalizeSkill(t));
  for (const group of Object.values(profile?.skillGroups || {})) {
    for (const t of group || []) tokens.add(normalizeSkill(t));
  }
  const highlightsBlob = (profile?.experience || [])
    .flatMap(e => e.highlights || [])
    .join(' \n ')
    .toLowerCase();
  return { tokens, highlightsBlob };
}

export function skillCovered(skillValue, lexicon) {
  const norm = normalizeSkill(skillValue);
  if (!norm) return false;
  if (lexicon.tokens.has(norm)) return true;
  return norm.length > 2 && lexicon.highlightsBlob.includes(norm);
}

function partitionByCoverage(skillValues, lexicon) {
  const covered = [];
  const missing = [];
  for (const value of skillValues) (skillCovered(value, lexicon) ? covered : missing).push(value);
  const total = skillValues.length;
  return { covered, missing, ratio: total === 0 ? null : covered.length / total };
}

// Profile-independent "does the JD mention this category at all" check —
// used for score.js's skill_fit "core stack present" term (§3.3).
const CORE_STACK_PATTERNS = {
  cloud: /\b(aws|amazon web services|gcp|google cloud|azure|cloud)\b/i,
  cicd: /\b(ci\/?cd|jenkins|github actions|gitlab ci|circleci|bamboo|harness|travis|teamcity)\b/i,
  containers: /\b(docker|kubernetes|k8s|containerd|ecs|eks|aks)\b/i,
  iac: /\b(terraform|ansible|pulumi|cloudformation|puppet|chef|arm template)\b/i,
};

export function coreStackScore(facts) {
  const haystack = [
    ...(facts.must_have_skills || []).map(s => s.value),
    ...(facts.nice_to_have_skills || []).map(s => s.value),
    ...(facts.responsibilities || []),
  ].join(' \n ');
  const hits = Object.values(CORE_STACK_PATTERNS).filter(re => re.test(haystack)).length;
  return hits / Object.keys(CORE_STACK_PATTERNS).length;
}

const SCALAR_EVIDENCE_FIELDS = ['role_title', 'seniority', 'location', 'salary', 'employment_type', 'role_nature'];

const RESET_VALUE = {
  role_title: () => ({ value: null, evidence: null }),
  seniority: () => ({ value: 'unstated', evidence: null }),
  location: () => ({ mode: 'unstated', cities: [], countries: [], evidence: null }),
  salary: () => ({ min: null, max: null, currency: null, period: null, evidence: null }),
  employment_type: () => ({ value: 'unstated', evidence: null }),
  role_nature: () => ({ value: 'unclear', evidence: null }),
};

/**
 * Validates an extraction against the JD text it came from and the
 * candidate profile. Never throws — a fabricated field is reset to
 * 'unstated'/dropped and recorded in `flags`, so a bad extraction degrades
 * to "unknown" rather than a wrong scored fact.
 *
 * @param {object} rawFacts - output of extract.js#extractFacts
 * @param {string} jobText
 * @param {object} profile
 * @returns {{facts: object, flags: string[], extractionValidity: number, skillCoverage: object}}
 */
export function validateExtraction(rawFacts, jobText, profile) {
  const facts = JSON.parse(JSON.stringify(rawFacts));
  const flags = [];
  let checked = 0;
  let passed = 0;

  if (facts.years_required?.evidence != null) {
    checked++;
    if (evidenceAppearsInText(facts.years_required.evidence, jobText)) {
      passed++;
    } else {
      flags.push('unverified:years_required');
      facts.years_required = { min: null, max: null, evidence: null };
    }
  }

  for (const field of SCALAR_EVIDENCE_FIELDS) {
    const node = facts[field];
    const evidence = node?.evidence;
    if (evidence == null) continue; // nothing claimed, nothing to verify
    checked++;
    if (evidenceAppearsInText(evidence, jobText)) {
      passed++;
    } else {
      flags.push(`unverified:${field}`);
      facts[field] = RESET_VALUE[field]();
    }
  }

  for (const signal of ['night_shift', 'rotational_shift', 'on_call', 'support_queue', 'presales']) {
    if (facts.signals?.[signal]) {
      const evidence = facts.signals.evidence?.[signal];
      checked++;
      if (evidence && evidenceAppearsInText(evidence, jobText)) {
        passed++;
      } else {
        flags.push(`unverified:signal:${signal}`);
        facts.signals[signal] = false;
      }
    }
  }

  for (const key of ['must_have_skills', 'nice_to_have_skills']) {
    const grounded = [];
    for (const skill of facts[key] || []) {
      checked++;
      if (evidenceAppearsInText(skill?.evidence, jobText)) {
        grounded.push(skill);
        passed++;
      } else {
        flags.push(`ungrounded:${key}:${skill?.value}`);
      }
    }
    facts[key] = grounded;
  }

  const extractionValidity = checked === 0 ? 1 : passed / checked;

  const lexicon = buildCandidateLexicon(profile);
  const skillCoverage = {
    mustHave: partitionByCoverage(facts.must_have_skills.map(s => s.value), lexicon),
    niceToHave: partitionByCoverage(facts.nice_to_have_skills.map(s => s.value), lexicon),
    coreStack: coreStackScore(facts),
  };

  return { facts, flags, extractionValidity, skillCoverage };
}
