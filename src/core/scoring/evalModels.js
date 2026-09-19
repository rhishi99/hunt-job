// Cross-provider extraction agreement — docs/fable51-answers.md §3.5.
//
// Runs extract.js against a fixed set of fixtures once per provider and
// reports how close each provider's extraction is to a hand-checked gold
// extraction, so `priorityOrder` in settings.json can be set from a measured
// report instead of taste. This module makes real LLM calls when invoked for
// real (`hunt-job eval-models`) — tests must stub extractFacts/generateJSON.
import { normalizeSkill } from './validate.js';
import { extractFacts } from './extract.js';

/**
 * Field-level agreement between an extraction and a fixture's gold `expected`
 * shape: must-have skill F1 (set overlap after alias normalization) and enum
 * exact-match accuracy across seniority / employment_type / role_nature /
 * location.mode.
 */
export function scoreAgreement(facts, expected) {
  if (!expected) return null;

  const enumChecks = [
    ['seniority', expected.seniority?.value, facts.seniority?.value],
    ['employment_type', expected.employment_type?.value, facts.employment_type?.value],
    ['role_nature', expected.role_nature?.value, facts.role_nature?.value],
    ['location_mode', expected.location?.mode, facts.location?.mode],
  ].filter(([, expectedValue]) => expectedValue !== undefined);

  const enumMatches = enumChecks.filter(([, e, g]) => e === g).length;
  const enumAccuracy = enumChecks.length ? enumMatches / enumChecks.length : null;

  const gotSkills = new Set((facts.must_have_skills || []).map(s => normalizeSkill(s.value)));
  const expSkills = new Set(
    (expected.must_have_skills || []).map(s => normalizeSkill(typeof s === 'string' ? s : s.value))
  );
  const truePositives = [...gotSkills].filter(s => expSkills.has(s)).length;
  const precision = gotSkills.size ? truePositives / gotSkills.size : expSkills.size ? 0 : 1;
  const recall = expSkills.size ? truePositives / expSkills.size : gotSkills.size ? 0 : 1;
  const skillF1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return { skillF1, enumAccuracy, enumChecks: enumChecks.length };
}

/**
 * Runs extraction for one provider across every fixture. Forces provider
 * selection the same way the rest of the codebase does (`AI_PROVIDER` env
 * var, read by aiClient.js#getAvailableProviders), restoring the previous
 * value afterwards so this never leaks into a caller's own provider choice.
 *
 * @param {string} providerName
 * @param {Array<{name: string, jobText: string, expected?: object}>} fixtures
 * @param {{extractFactsFn?: Function}} [opts] - extractFactsFn override for tests
 */
export async function evalProviderOnFixtures(providerName, fixtures, opts = {}) {
  const doExtract = opts.extractFactsFn || extractFacts;
  const previousForced = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = providerName;

  try {
    const results = [];
    for (const fixture of fixtures) {
      try {
        const { facts } = await doExtract(fixture.jobText, { taskType: 'light' });
        results.push({
          fixture: fixture.name,
          ok: true,
          facts,
          agreement: scoreAgreement(facts, fixture.expected),
        });
      } catch (e) {
        results.push({ fixture: fixture.name, ok: false, error: e.message });
      }
    }
    return results;
  } finally {
    if (previousForced === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousForced;
  }
}

/** Aggregates evalProviderOnFixtures' per-fixture rows into one summary. */
export function summarizeProviderResults(results) {
  const ok = results.filter(r => r.ok);
  if (!ok.length) return { total: results.length, ok: 0, avgSkillF1: null, avgEnumAccuracy: null };

  const withAgreement = ok.filter(r => r.agreement);
  const avgSkillF1 = withAgreement.length
    ? withAgreement.reduce((sum, r) => sum + r.agreement.skillF1, 0) / withAgreement.length
    : null;
  const withEnum = withAgreement.filter(r => r.agreement.enumAccuracy != null);
  const avgEnumAccuracy = withEnum.length
    ? withEnum.reduce((sum, r) => sum + r.agreement.enumAccuracy, 0) / withEnum.length
    : null;

  return { total: results.length, ok: ok.length, avgSkillF1, avgEnumAccuracy };
}
