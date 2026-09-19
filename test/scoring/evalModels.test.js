import { describe, test, expect, vi, afterEach } from 'vitest';
import { scoreAgreement, evalProviderOnFixtures, summarizeProviderResults } from '../../src/core/scoring/evalModels.js';

describe('scoreAgreement', () => {
  test('perfect match -> skillF1 1.0 and enumAccuracy 1.0', () => {
    const expected = {
      seniority: { value: 'senior' },
      employment_type: { value: 'full-time' },
      role_nature: { value: 'engineering_ownership' },
      location: { mode: 'remote' },
      must_have_skills: [{ value: 'AWS' }, { value: 'Kubernetes' }],
    };
    const facts = {
      seniority: { value: 'senior' },
      employment_type: { value: 'full-time' },
      role_nature: { value: 'engineering_ownership' },
      location: { mode: 'remote' },
      must_have_skills: [{ value: 'AWS' }, { value: 'K8s' }], // alias-equivalent to Kubernetes
    };
    const agreement = scoreAgreement(facts, expected);
    expect(agreement.skillF1).toBe(1);
    expect(agreement.enumAccuracy).toBe(1);
  });

  test('partial skill overlap yields a fractional F1', () => {
    const expected = { must_have_skills: [{ value: 'AWS' }, { value: 'Kubernetes' }] };
    const facts = { must_have_skills: [{ value: 'AWS' }, { value: 'Rust' }] };
    const agreement = scoreAgreement(facts, expected);
    expect(agreement.skillF1).toBeGreaterThan(0);
    expect(agreement.skillF1).toBeLessThan(1);
  });

  test('returns null when the fixture has no gold expectation', () => {
    expect(scoreAgreement({}, undefined)).toBeNull();
  });
});

describe('evalProviderOnFixtures', () => {
  afterEach(() => {
    delete process.env.AI_PROVIDER;
  });

  test('forces AI_PROVIDER for the duration of the run and restores it afterward', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    const seen = [];
    const extractFactsFn = vi.fn(async () => {
      seen.push(process.env.AI_PROVIDER);
      return { facts: { must_have_skills: [] } };
    });

    await evalProviderOnFixtures('groq', [{ name: 'fx1', jobText: 'JD text' }], { extractFactsFn });

    expect(seen).toEqual(['groq']);
    expect(process.env.AI_PROVIDER).toBe('anthropic'); // restored, never leaks
  });

  test('a per-fixture extraction failure is captured, not thrown', async () => {
    const extractFactsFn = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    const results = await evalProviderOnFixtures('groq', [{ name: 'fx1', jobText: 'JD text' }], { extractFactsFn });

    expect(results).toEqual([{ fixture: 'fx1', ok: false, error: 'provider unavailable' }]);
  });

  test('never makes a real network call — this test only exercises the stubbed extractFactsFn path', async () => {
    const extractFactsFn = vi.fn(async () => ({ facts: { must_have_skills: [] } }));
    await evalProviderOnFixtures('nvidia', [{ name: 'fx1', jobText: 'x' }], { extractFactsFn });
    expect(extractFactsFn).toHaveBeenCalledTimes(1);
  });
});

describe('summarizeProviderResults', () => {
  test('averages skillF1/enumAccuracy across successful fixtures only', () => {
    const results = [
      { ok: true, agreement: { skillF1: 1, enumAccuracy: 1 } },
      { ok: true, agreement: { skillF1: 0.5, enumAccuracy: 0.5 } },
      { ok: false, error: 'boom' },
    ];
    const summary = summarizeProviderResults(results);
    expect(summary).toEqual({ total: 3, ok: 2, avgSkillF1: 0.75, avgEnumAccuracy: 0.75 });
  });

  test('every fixture failing -> ok 0, no averages', () => {
    const summary = summarizeProviderResults([{ ok: false, error: 'x' }]);
    expect(summary).toEqual({ total: 1, ok: 0, avgSkillF1: null, avgEnumAccuracy: null });
  });
});
