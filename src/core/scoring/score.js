// Deterministic scoring — docs/fable51-answers.md §3.3.
//
// Pure code, no LLM, no I/O except the two `db`-taking helpers that read/seed
// `score_versions` (same "db explicit first param" convention as
// ./states.js, ./queue.js). Vetoes short-circuit to score 0 before any
// weighted component is computed. Every other component is 0..1 or `null`
// ("unknown" — excluded from both the weighted sum and the denominator, so
// an unstated field lowers coverage instead of being guessed at).

export const DEFAULT_WEIGHTS = Object.freeze({
  skill_fit: 0.4,
  seniority_fit: 0.15,
  location_fit: 0.2,
  salary_fit: 0.1,
  role_scope: 0.1,
  freshness: 0.05,
});

/** Hard vetoes → score 0, recommendation 'Skip' (§3.3). Checked before any component. */
export function checkVetoes(facts, profile) {
  const rules = profile?.rules || {};
  const allowedCities = (rules.allowedOnsiteCities || []).map(c => String(c).toLowerCase());

  if (facts.location?.mode === 'onsite') {
    const cities = (facts.location.cities || []).map(c => String(c).toLowerCase());
    const inAllowed = cities.length > 0 && cities.some(c => allowedCities.includes(c));
    if (!inAllowed) return { vetoed: true, reason: 'veto:onsite_outside_allowed_cities' };
  }
  if (facts.signals?.night_shift) return { vetoed: true, reason: 'veto:night_shift' };
  if (facts.signals?.rotational_shift) return { vetoed: true, reason: 'veto:rotational_shift' };
  if (facts.role_nature?.value === 'support') return { vetoed: true, reason: 'veto:support_role' };
  if (facts.seniority?.value === 'junior') return { vetoed: true, reason: 'veto:junior_seniority' };

  const allowedTypes = rules.employmentTypes;
  if (Array.isArray(allowedTypes) && allowedTypes.length && facts.employment_type?.value !== 'unstated') {
    const normalized = allowedTypes.map(t => (t == null ? null : String(t).toLowerCase()));
    if (!normalized.includes(String(facts.employment_type?.value).toLowerCase())) {
      return { vetoed: true, reason: 'veto:employment_type' };
    }
  }

  return { vetoed: false, reason: null };
}

function seniorityFit(facts) {
  const value = facts.seniority?.value;
  if (!value || value === 'unstated') return null;
  if (value === 'staff' || value === 'lead' || value === 'senior') return 1.0;
  if (value === 'manager') return 0.7;
  if (value === 'mid') return 0.5;
  return 0.3; // junior would already have vetoed; kept as a defensive fallback
}

function locationFit(facts, profile) {
  const mode = facts.location?.mode;
  if (!mode || mode === 'unstated') return null;
  const rules = profile?.rules || {};
  const allowedCities = (rules.allowedOnsiteCities || []).map(c => String(c).toLowerCase());
  const cities = (facts.location?.cities || []).map(c => String(c).toLowerCase());
  const inAllowedCity = cities.some(c => allowedCities.includes(c));

  if (mode === 'remote') return 1.0;
  if (mode === 'hybrid') return inAllowedCity ? 0.9 : 0.5;
  if (mode === 'onsite') return inAllowedCity ? 0.7 : 0.2; // non-allowed onsite already vetoed above
  return null;
}

function salaryFit(facts, profile) {
  const salary = facts.salary;
  if (!salary || (salary.min == null && salary.max == null)) return null;
  const profileSalary = profile?.salary;
  if (!profileSalary || (profileSalary.min == null && profileSalary.max == null)) return null;

  const jdMin = salary.min ?? salary.max;
  const jdMax = salary.max ?? salary.min;
  const pMin = profileSalary.min ?? 0;
  const pMax = profileSalary.max ?? Infinity;

  if (jdMax != null && jdMax < pMin) return 0.2; // below the candidate's floor
  if (jdMin != null && jdMin > pMax) return 1.0; // above range — treat as a win, not a mismatch
  return 1.0; // overlaps the candidate's range
}

function roleScope(facts) {
  const nature = facts.role_nature?.value;
  if (nature === 'engineering_ownership') return 1.0;
  if (nature === 'consulting') return 0.7;
  if (nature === 'presales') return 0.4;
  return null; // 'unclear' (or 'support', which already vetoed)
}

function freshness(postedAt) {
  if (!postedAt) return null;
  const days = (Date.now() - postedAt) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 1.0;
  if (days >= 45) return 0.3;
  return 1.0 - ((days - 7) / (45 - 7)) * 0.7; // linear 1.0 -> 0.3 across the 7-45 day window
}

/** Table in §3.3. `skillCoverage` is validate.js's output — never recomputed here. */
export function computeComponents(facts, profile, skillCoverage, postedAt) {
  const skill_fit =
    0.6 * (skillCoverage?.mustHave?.ratio ?? 0) +
    0.2 * (skillCoverage?.niceToHave?.ratio ?? 0) +
    0.2 * (skillCoverage?.coreStack ?? 0);

  return {
    skill_fit,
    seniority_fit: seniorityFit(facts),
    location_fit: locationFit(facts, profile),
    salary_fit: salaryFit(facts, profile),
    role_scope: roleScope(facts),
    freshness: freshness(postedAt),
  };
}

/** score = 1 + 4*Σ(w·v)/Σw(v≠null); coverage = Σw(v≠null) (weights sum to 1.0). */
export function aggregateScore(components, weights = DEFAULT_WEIGHTS) {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [key, w] of Object.entries(weights)) {
    const v = components[key];
    if (v == null) continue;
    weightedSum += w * v;
    weightTotal += w;
  }
  const score = weightTotal === 0 ? 1 : 1 + 4 * (weightedSum / weightTotal);
  return { score: Math.round(score * 100) / 100, coverage: Math.round(weightTotal * 100) / 100 };
}

/** A score on coverage < 0.5 can never be 'Apply' (§3.3) — it caps at 'Maybe'. */
export function recommend(score, coverage, minimumApplyScore) {
  if (score >= minimumApplyScore) return coverage >= 0.5 ? 'Apply' : 'Maybe';
  if (score >= 3.0) return 'Maybe';
  return 'Skip';
}

/** Reads the latest score_versions row, seeding v1 with DEFAULT_WEIGHTS if the table is somehow empty. */
export function ensureScoreVersion(db) {
  let row = db.prepare('SELECT * FROM score_versions ORDER BY version DESC LIMIT 1').get();
  if (!row) {
    db.prepare(`INSERT INTO score_versions (version, weights, created_at, reason) VALUES (1, ?, ?, ?)`).run(
      JSON.stringify(DEFAULT_WEIGHTS),
      Date.now(),
      'seeded by scoring/score.js#ensureScoreVersion — table was empty'
    );
    row = db.prepare('SELECT * FROM score_versions WHERE version = 1').get();
  }
  return row;
}

export function getScoreVersion(db, version) {
  return db.prepare('SELECT * FROM score_versions WHERE version = ?').get(version);
}

/**
 * Full deterministic pipeline: veto check -> components -> aggregate -> recommendation.
 * @param {{facts: object, profile: object, skillCoverage: object, weights?: object, postedAt?: number|null, minimumApplyScore?: number}} args
 */
export function scoreEvaluation({ facts, profile, skillCoverage, weights = DEFAULT_WEIGHTS, postedAt = null, minimumApplyScore = 4.0 }) {
  const veto = checkVetoes(facts, profile);
  if (veto.vetoed) {
    return { score: 0, coverage: 0, recommendation: 'Skip', vetoed: true, vetoReason: veto.reason, componentScores: {} };
  }

  const componentScores = computeComponents(facts, profile, skillCoverage, postedAt);
  const { score, coverage } = aggregateScore(componentScores, weights);
  const recommendation = recommend(score, coverage, minimumApplyScore);

  return { score, coverage, recommendation, vetoed: false, vetoReason: null, componentScores };
}
