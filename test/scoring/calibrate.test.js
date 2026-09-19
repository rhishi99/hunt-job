import { describe, it, expect } from 'vitest';
import { classifyRow, buildCalibration } from '../../src/core/scoring/calibrate.js';
import { DEFAULT_WEIGHTS } from '../../src/core/scoring/score.js';

const sample = (cls, skill) => ({ cls, components: { skill_fit: skill, seniority_fit: 0.5, location_fit: 0.5, salary_fit: null, role_scope: 0.5, freshness: 0.5 } });

describe('classifyRow', () => {
  it('label beats state; rejected-after-interview is not negative', () => {
    expect(classifyRow({ state: 'rejected', user_label: 'good' })).toBe('pos');
    expect(classifyRow({ state: 'interview' })).toBe('pos');
    expect(classifyRow({ state: 'rejected', reachedInterview: 0 })).toBe('neg');
    expect(classifyRow({ state: 'rejected', reachedInterview: 1 })).toBeNull();
    expect(classifyRow({ state: 'applied' })).toBeNull();
  });
});

describe('buildCalibration', () => {
  it('proposes nothing below the per-class minimum', () => {
    const s = [...Array(5).fill(0).map(() => sample('pos', 0.9)), ...Array(5).fill(0).map(() => sample('neg', 0.3))];
    const cal = buildCalibration(s, { ...DEFAULT_WEIGHTS });
    expect(cal.changed).toBe(false);
  });

  it('nudges skill_fit up when gap is large, weights renormalize to 1', () => {
    const s = [...Array(15).fill(0).map(() => sample('pos', 0.9)), ...Array(15).fill(0).map(() => sample('neg', 0.3))];
    const cal = buildCalibration(s, { ...DEFAULT_WEIGHTS });
    expect(cal.stats.skill_fit.nudged).toBe(true);
    expect(cal.proposed.skill_fit).toBeGreaterThan(DEFAULT_WEIGHTS.skill_fit);
    expect(Object.values(cal.proposed).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
  });
});
