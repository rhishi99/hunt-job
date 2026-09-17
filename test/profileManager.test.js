import { describe, it, expect } from 'vitest';
import { isProfileComplete } from '../src/core/profileManager.js';
import { profileFromResume } from '../scripts/seed-profile.js';
import { defaultResumeData } from '../src/core/resumeData.js';

const complete = () => profileFromResume(defaultResumeData());

describe('isProfileComplete', () => {
  it('accepts a profile seeded from the canonical resume', () => {
    expect(isProfileComplete(complete())).toEqual({ ok: true, missing: [] });
  });

  it('rejects the empty scaffold that profile:init writes', () => {
    const { ok, missing } = isProfileComplete({
      name: '', currentRole: '', yearsOfExperience: 0,
      archetypes: [], techStack: [], salary: { min: 0, max: 0 }, experience: [],
    });
    expect(ok).toBe(false);
    expect(missing).toEqual([
      'name', 'currentRole', 'yearsOfExperience',
      'archetypes', 'techStack', 'salary', 'experience',
    ]);
  });

  it('treats "Updated Name" as a placeholder, not a real name', () => {
    expect(isProfileComplete({ ...complete(), name: 'Updated Name' }).missing).toContain('name');
  });

  it('reports a missing profile rather than throwing', () => {
    expect(isProfileComplete(null).ok).toBe(false);
    expect(isProfileComplete(undefined).ok).toBe(false);
  });

  it('flags each evaluator-consumed field independently', () => {
    for (const field of ['currentRole', 'archetypes', 'techStack', 'experience']) {
      const p = complete();
      p[field] = Array.isArray(p[field]) ? [] : '';
      expect(isProfileComplete(p).missing).toEqual([field]);
    }
  });

  it('accepts a salary range with only max set', () => {
    expect(isProfileComplete({ ...complete(), salary: { min: 0, max: 70 } }).ok).toBe(true);
  });
});
