// Narrative — matches/mismatches/reasoning built from facts, no LLM (§3.4).
// Pure and deterministic: same inputs always produce the same strings, which
// is what makes the evaluation reproducible end to end, not just the number.

const VETO_LABELS = {
  'veto:onsite_outside_allowed_cities': 'Onsite-only role outside the allowed cities',
  'veto:night_shift': 'Night shift required',
  'veto:rotational_shift': 'Rotational shift required',
  'veto:support_role': 'Pure support / ticket-queue role, not engineering ownership',
  'veto:junior_seniority': 'Seniority below the target level',
  'veto:employment_type': 'Employment type outside the accepted types',
};

function humanizeVetoReason(reason) {
  return VETO_LABELS[reason] || reason || 'Vetoed';
}

/**
 * @param {{facts: object, skillCoverage: object, componentScores: object, vetoed: boolean, vetoReason: string|null, score: number, coverage: number}} args
 * @returns {{matches: string[], mismatches: string[], reasoning: string}}
 */
export function buildNarrative({ facts, skillCoverage, vetoed, vetoReason, score, coverage }) {
  if (vetoed) {
    const label = humanizeVetoReason(vetoReason);
    return { matches: [], mismatches: [label], reasoning: `Vetoed: ${label}.` };
  }

  const matches = [];
  const mismatches = [];

  for (const s of skillCoverage?.mustHave?.covered || []) matches.push(`Must-have skill matched: ${s}`);
  for (const s of skillCoverage?.mustHave?.missing || []) mismatches.push(`Missing must-have skill: ${s}`);
  for (const s of skillCoverage?.niceToHave?.covered || []) matches.push(`Nice-to-have skill matched: ${s}`);

  if (facts.location?.mode && facts.location.mode !== 'unstated') {
    matches.push(`Location: ${facts.location.mode}`);
  } else {
    mismatches.push('Location mode not stated in the posting');
  }

  if (facts.seniority?.value && facts.seniority.value !== 'unstated') {
    matches.push(`Seniority: ${facts.seniority.value}`);
  } else {
    mismatches.push('Seniority not stated in the posting');
  }

  if (!facts.salary || (facts.salary.min == null && facts.salary.max == null)) {
    mismatches.push('Salary not stated in the posting');
  }

  const pct = Math.round((coverage ?? 0) * 100);
  const mustHaveRatio = skillCoverage?.mustHave?.ratio;
  const reasoning =
    `Scored ${score}/5.0 on ${pct}% of scoring criteria` +
    (mustHaveRatio != null
      ? `; ${Math.round(mustHaveRatio * 100)}% of must-have skills matched the candidate profile.`
      : '.');

  return { matches, mismatches, reasoning };
}
