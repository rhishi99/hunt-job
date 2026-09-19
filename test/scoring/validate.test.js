import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeSkill,
  normalizeText,
  evidenceAppearsInText,
  buildCandidateLexicon,
  skillCovered,
  coreStackScore,
  validateExtraction,
} from '../../src/core/scoring/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/scoring', `${name}.json`), 'utf-8'));
}

const profile = {
  techStack: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD', 'Docker', 'Ansible'],
  skillGroups: { 'Cloud & AWS': ['AWS'], 'IaC & Config': ['Terraform', 'Ansible'] },
  experience: [{ highlights: ['Ran incident response and on-call rotations for production services.'] }],
};

describe('normalizeSkill / alias map', () => {
  test('k8s and Kubernetes normalize the same', () => {
    expect(normalizeSkill('k8s')).toBe(normalizeSkill('Kubernetes'));
  });
  test('CI/CD variants normalize the same', () => {
    expect(normalizeSkill('CI/CD')).toBe(normalizeSkill('ci-cd'));
    expect(normalizeSkill('Continuous Integration')).toBe(normalizeSkill('cicd'));
  });
});

describe('evidenceAppearsInText', () => {
  test('matches after whitespace/case normalization', () => {
    expect(evidenceAppearsInText('Strong  hands-on   experience', 'strong hands-on experience with AWS')).toBe(true);
  });
  test('does not match a quote absent from the text', () => {
    expect(evidenceAppearsInText('10 years of Rust experience', 'We need a DevOps engineer.')).toBe(false);
  });
  test('empty/null evidence never matches', () => {
    expect(evidenceAppearsInText(null, 'anything')).toBe(false);
    expect(evidenceAppearsInText('', 'anything')).toBe(false);
  });
});

describe('buildCandidateLexicon / skillCovered', () => {
  test('covers techStack entries via alias (K8s -> kubernetes, already in techStack)', () => {
    const lexicon = buildCandidateLexicon(profile);
    expect(skillCovered('K8s', lexicon)).toBe(true);
  });

  test('covers a multi-word phrase only present in experience bullets', () => {
    const lexicon = buildCandidateLexicon(profile);
    expect(skillCovered('on-call rotations', lexicon)).toBe(true);
  });

  test('does not cover a skill absent from techStack, skillGroups, and bullets', () => {
    const lexicon = buildCandidateLexicon(profile);
    expect(skillCovered('Rust', lexicon)).toBe(false);
  });
});

describe('coreStackScore', () => {
  test('scores 1.0 when all four categories are mentioned', () => {
    const facts = {
      must_have_skills: [{ value: 'AWS' }, { value: 'Kubernetes' }, { value: 'Terraform' }, { value: 'CI/CD' }],
      nice_to_have_skills: [],
      responsibilities: [],
    };
    expect(coreStackScore(facts)).toBe(1);
  });

  test('scores 0 when none are mentioned', () => {
    const facts = { must_have_skills: [{ value: 'Salesforce' }], nice_to_have_skills: [], responsibilities: [] };
    expect(coreStackScore(facts)).toBe(0);
  });
});

describe('validateExtraction — evidence-in-JD grounding', () => {
  test('a hand-checked gold extraction validates clean against its own JD (validity 1.0, nothing dropped)', () => {
    const fixture = loadFixture('devops-remote-senior');
    const result = validateExtraction(fixture.expected, fixture.jobText, profile);

    expect(result.extractionValidity).toBe(1);
    expect(result.flags).toEqual([]);
    expect(result.facts.must_have_skills).toHaveLength(4);
    expect(result.facts.role_title.value).toBe('Senior DevOps Engineer');
  });

  test('rejects a fabricated evidence quote: the field resets to unstated and is flagged', () => {
    const fixture = loadFixture('devops-remote-senior');
    const fabricated = JSON.parse(JSON.stringify(fixture.expected));
    fabricated.role_title = { value: 'Principal Architect', evidence: 'This exact phrase is not in the JD anywhere' };

    const result = validateExtraction(fabricated, fixture.jobText, profile);

    expect(result.facts.role_title).toEqual({ value: null, evidence: null });
    expect(result.flags).toContain('unverified:role_title');
    expect(result.extractionValidity).toBeLessThan(1);
  });

  test('rejects a fabricated must-have skill by dropping it from the list', () => {
    const fixture = loadFixture('devops-remote-senior');
    const fabricated = JSON.parse(JSON.stringify(fixture.expected));
    fabricated.must_have_skills.push({ value: 'Rust', evidence: 'Expert-level Rust required' });

    const result = validateExtraction(fabricated, fixture.jobText, profile);

    expect(result.facts.must_have_skills.map(s => s.value)).not.toContain('Rust');
    expect(result.flags.some(f => f.startsWith('ungrounded:must_have_skills:Rust'))).toBe(true);
  });

  test('a claimed-but-unevidenced true signal is flipped back to false', () => {
    const fixture = loadFixture('devops-remote-senior');
    const fabricated = JSON.parse(JSON.stringify(fixture.expected));
    fabricated.signals.night_shift = true; // no evidence.night_shift quote provided

    const result = validateExtraction(fabricated, fixture.jobText, profile);

    expect(result.facts.signals.night_shift).toBe(false);
    expect(result.flags).toContain('unverified:signal:night_shift');
  });

  test('the veto fixture (support/night-shift) validates clean and grounds its signals', () => {
    const fixture = loadFixture('support-l1-nightshift');
    const result = validateExtraction(fixture.expected, fixture.jobText, profile);

    expect(result.extractionValidity).toBe(1);
    expect(result.facts.signals.night_shift).toBe(true);
    expect(result.facts.signals.rotational_shift).toBe(true);
    expect(result.facts.role_nature.value).toBe('support');
  });
});

describe('validateExtraction — skill grounding against the profile (skillCoverage)', () => {
  test('reports must-have coverage ratio against the candidate lexicon', () => {
    const fixture = loadFixture('devops-remote-senior');
    const result = validateExtraction(fixture.expected, fixture.jobText, profile);

    // AWS, Kubernetes, Terraform, CI/CD are all in `profile.techStack`
    expect(result.skillCoverage.mustHave.ratio).toBe(1);
    expect(result.skillCoverage.mustHave.missing).toEqual([]);
  });

  test('nice-to-have skills the profile does not have show up as missing', () => {
    const fixture = loadFixture('devops-remote-senior');
    const result = validateExtraction(fixture.expected, fixture.jobText, profile);

    expect(result.skillCoverage.niceToHave.missing).toContain('Python');
    expect(result.skillCoverage.niceToHave.missing).toContain('Datadog');
    expect(result.skillCoverage.niceToHave.ratio).toBe(0);
  });
});
