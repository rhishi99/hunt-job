import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateExtraction } from '../../src/core/scoring/validate.js';
import { scoreEvaluation } from '../../src/core/scoring/score.js';
import { buildNarrative } from '../../src/core/scoring/narrative.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/scoring', `${name}.json`), 'utf-8'));
}

const profile = {
  salary: { min: 40, max: 70, currency: 'INR', unit: 'LPA' },
  techStack: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD'],
  skillGroups: {},
  rules: { allowedOnsiteCities: ['Pune', 'Mumbai', 'Bangalore', 'Bengaluru'], employmentTypes: ['full-time', null] },
};

function narrativeFor(fixtureName) {
  const fixture = loadFixture(fixtureName);
  const validated = validateExtraction(fixture.expected, fixture.jobText, profile);
  const scored = scoreEvaluation({ facts: validated.facts, profile, skillCoverage: validated.skillCoverage, minimumApplyScore: 4.0 });
  return buildNarrative({
    facts: validated.facts,
    skillCoverage: validated.skillCoverage,
    vetoed: scored.vetoed,
    vetoReason: scored.vetoReason,
    score: scored.score,
    coverage: scored.coverage,
  });
}

describe('buildNarrative — no LLM, deterministic', () => {
  test('is stable: the same inputs produce byte-identical output on repeat calls', () => {
    const a = narrativeFor('devops-remote-senior');
    const b = narrativeFor('devops-remote-senior');
    expect(a).toEqual(b);
  });

  test('vetoed jobs get an empty matches list and a human-readable veto reason', () => {
    const narrative = narrativeFor('support-l1-nightshift');
    expect(narrative.matches).toEqual([]);
    expect(narrative.mismatches).toHaveLength(1);
    expect(narrative.mismatches[0]).toMatch(/night shift/i);
    expect(narrative.reasoning).toMatch(/^Vetoed:/);
  });

  test('a covered must-have skill appears in matches; a missing one appears in mismatches', () => {
    const narrative = narrativeFor('devops-remote-senior');
    expect(narrative.matches.some(m => m.includes('AWS'))).toBe(true);
    expect(narrative.mismatches.some(m => m.includes('Python'))).toBe(false); // Python is nice-to-have, not must-have
  });

  test('reasoning states the score and the coverage percentage', () => {
    const narrative = narrativeFor('devops-remote-senior');
    expect(narrative.reasoning).toMatch(/Scored \d+(\.\d+)?\/5\.0 on \d+% of scoring criteria/);
  });

  test('unstated salary is surfaced as a mismatch', () => {
    const narrative = narrativeFor('devops-remote-senior');
    expect(narrative.mismatches).toContain('Salary not stated in the posting');
  });
});
