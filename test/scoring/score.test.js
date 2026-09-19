import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { validateExtraction } from '../../src/core/scoring/validate.js';
import {
  DEFAULT_WEIGHTS,
  checkVetoes,
  computeComponents,
  aggregateScore,
  recommend,
  ensureScoreVersion,
  getScoreVersion,
  scoreEvaluation,
} from '../../src/core/scoring/score.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/scoring', `${name}.json`), 'utf-8'));
}

const profile = {
  salary: { min: 40, max: 70, currency: 'INR', unit: 'LPA' },
  techStack: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD', 'Docker', 'Ansible'],
  skillGroups: {},
  rules: {
    allowedOnsiteCities: ['Pune', 'Mumbai', 'Bangalore', 'Bengaluru'],
    employmentTypes: ['full-time', null],
  },
};

function scoreFixture(name) {
  const fixture = loadFixture(name);
  const validated = validateExtraction(fixture.expected, fixture.jobText, profile);
  return { fixture, validated };
}

describe('checkVetoes', () => {
  test('night shift vetoes', () => {
    const { validated } = scoreFixture('support-l1-nightshift');
    expect(checkVetoes(validated.facts, profile)).toEqual({ vetoed: true, reason: 'veto:night_shift' });
  });

  test('onsite outside allowed cities vetoes', () => {
    const facts = { location: { mode: 'onsite', cities: ['Berlin'] }, signals: {}, seniority: { value: 'senior' } };
    expect(checkVetoes(facts, profile).vetoed).toBe(true);
  });

  test('onsite inside an allowed city does not veto', () => {
    const { validated } = scoreFixture('sre-onsite-bangalore');
    expect(checkVetoes(validated.facts, profile).vetoed).toBe(false);
  });

  test('junior seniority vetoes', () => {
    const facts = { seniority: { value: 'junior' }, signals: {}, location: { mode: 'remote' } };
    expect(checkVetoes(facts, profile)).toEqual({ vetoed: true, reason: 'veto:junior_seniority' });
  });

  test('support role_nature vetoes', () => {
    const facts = { role_nature: { value: 'support' }, signals: {}, seniority: { value: 'mid' }, location: { mode: 'remote' } };
    expect(checkVetoes(facts, profile)).toEqual({ vetoed: true, reason: 'veto:support_role' });
  });

  test('employment type outside the accepted list vetoes', () => {
    const facts = {
      employment_type: { value: 'internship' },
      signals: {},
      seniority: { value: 'senior' },
      location: { mode: 'remote' },
    };
    expect(checkVetoes(facts, profile)).toEqual({ vetoed: true, reason: 'veto:employment_type' });
  });

  test('a clean senior remote full-time posting does not veto', () => {
    const { validated } = scoreFixture('devops-remote-senior');
    expect(checkVetoes(validated.facts, profile)).toEqual({ vetoed: false, reason: null });
  });
});

describe('computeComponents — deterministic given the same inputs', () => {
  test('same facts + profile always produce the same components', () => {
    const { validated } = scoreFixture('devops-remote-senior');
    const a = computeComponents(validated.facts, profile, validated.skillCoverage, null);
    const b = computeComponents(validated.facts, profile, validated.skillCoverage, null);
    expect(a).toEqual(b);
  });

  test('skill_fit rewards must-have coverage, seniority/location/role_scope resolve from facts', () => {
    const { validated } = scoreFixture('devops-remote-senior');
    const components = computeComponents(validated.facts, profile, validated.skillCoverage, null);
    expect(components.skill_fit).toBeGreaterThan(0.5);
    expect(components.seniority_fit).toBe(1.0); // senior
    expect(components.location_fit).toBe(1.0); // remote
    expect(components.role_scope).toBe(1.0); // engineering_ownership
    expect(components.salary_fit).toBeNull(); // JD states no salary
  });
});

describe('aggregateScore', () => {
  test('coverage = sum of weights of non-null components (weights sum to 1.0)', () => {
    const { score, coverage } = aggregateScore(
      { skill_fit: 1, seniority_fit: 1, location_fit: null, salary_fit: null, role_scope: null, freshness: null },
      DEFAULT_WEIGHTS
    );
    expect(coverage).toBeCloseTo(0.4 + 0.15, 5);
    expect(score).toBe(5); // both known components are 1.0 -> perfect weighted average
  });

  test('all components null -> coverage 0, score defaults to 1 (no known signal)', () => {
    const { score, coverage } = aggregateScore({}, DEFAULT_WEIGHTS);
    expect(coverage).toBe(0);
    expect(score).toBe(1);
  });
});

describe('recommend — coverage gate on Apply', () => {
  test('high score + high coverage -> Apply', () => {
    expect(recommend(4.5, 0.85, 4.0)).toBe('Apply');
  });
  test('high score but coverage < 0.5 caps at Maybe, never Apply', () => {
    expect(recommend(4.5, 0.4, 4.0)).toBe('Maybe');
  });
  test('score in [3.0, threshold) is Maybe', () => {
    expect(recommend(3.5, 0.9, 4.0)).toBe('Maybe');
  });
  test('score below 3.0 is Skip', () => {
    expect(recommend(2.0, 0.9, 4.0)).toBe('Skip');
  });
});

describe('scoreEvaluation — veto caps the score to 0 (acceptance: veto caps score)', () => {
  test('a vetoed extraction always scores 0 / Skip regardless of any other component', () => {
    const { validated } = scoreFixture('support-l1-nightshift');
    const result = scoreEvaluation({ facts: validated.facts, profile, skillCoverage: validated.skillCoverage, minimumApplyScore: 4.0 });
    expect(result).toMatchObject({ score: 0, coverage: 0, recommendation: 'Skip', vetoed: true, vetoReason: 'veto:night_shift' });
  });

  test('a clean strong-match posting scores >= minimumApplyScore and recommends Apply', () => {
    const { validated } = scoreFixture('devops-remote-senior');
    const result = scoreEvaluation({ facts: validated.facts, profile, skillCoverage: validated.skillCoverage, minimumApplyScore: 4.0 });
    expect(result.vetoed).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(4.0);
    expect(result.recommendation).toBe('Apply');
  });

  test('deterministic: scoring the same facts twice yields the exact same score', () => {
    const { validated } = scoreFixture('devops-remote-senior');
    const a = scoreEvaluation({ facts: validated.facts, profile, skillCoverage: validated.skillCoverage, minimumApplyScore: 4.0 });
    const b = scoreEvaluation({ facts: validated.facts, profile, skillCoverage: validated.skillCoverage, minimumApplyScore: 4.0 });
    expect(a.score).toBe(b.score);
    expect(a.recommendation).toBe(b.recommendation);
  });
});

describe('score_versions (§3.3, §3.6) — versioned weights', () => {
  function freshDb() {
    const db = new Database(':memory:');
    runMigrations(db);
    return db;
  }

  test('migration v5 already seeds version 1 with DEFAULT_WEIGHTS', () => {
    const db = freshDb();
    const row = ensureScoreVersion(db);
    expect(row.version).toBe(1);
    expect(JSON.parse(row.weights)).toEqual(DEFAULT_WEIGHTS);
  });

  test('ensureScoreVersion seeds v1 if the table was emptied', () => {
    const db = freshDb();
    db.prepare('DELETE FROM score_versions').run();
    const row = ensureScoreVersion(db);
    expect(row.version).toBe(1);
    expect(getScoreVersion(db, 1)).toBeTruthy();
  });

  test('every evaluation is stamped with the score_version it was scored under', () => {
    const db = freshDb();
    const row = ensureScoreVersion(db);
    const { validated } = scoreFixture('devops-remote-senior');
    const result = scoreEvaluation({
      facts: validated.facts,
      profile,
      skillCoverage: validated.skillCoverage,
      weights: JSON.parse(row.weights),
      minimumApplyScore: 4.0,
    });
    expect(result.score).toBeGreaterThan(0);
    expect(row.version).toBe(1); // the version this score was computed under
  });
});
