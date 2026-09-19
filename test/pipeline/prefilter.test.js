import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { applyRules, lexicalScore, prefilterJobs } from '../../src/core/pipeline/prefilter.js';

const RULES = {
  allowedOnsiteCities: ['Pune', 'Mumbai', 'Bangalore', 'Bengaluru'],
  vetoTitle: ['\\bL1\\b', '\\bL2\\b', 'support engineer', 'helpdesk', 'noc engineer', 'night shift'],
  vetoText: ['rotational night', 'night shift', '24x7 support', 'ticket queue'],
  minSeniority: 'senior',
  employmentTypes: ['full-time', null],
  maxAgeDays: 45,
};

const NOW = Date.now();
const days = n => NOW - n * 86400000;

function baseJob(overrides = {}) {
  return {
    title: 'Senior DevOps Engineer',
    description: 'Own our AWS infrastructure, CI/CD pipelines with Jenkins, Terraform and Kubernetes.',
    location: 'Pune, India',
    employmentType: 'full-time',
    postedAt: days(1),
    ...overrides,
  };
}

const PROFILE = {
  archetypes: ['DevOps Engineer'],
  rules: RULES,
  techStack: ['AWS', 'Terraform', 'Kubernetes', 'Jenkins', 'CI/CD'],
  skillGroups: {},
  experience: [
    {
      title: 'Staff Engineer', company: 'Acme',
      bullets: [
        'Managed AWS cloud infrastructure across EC2, S3, RDS, IAM, VPC.',
        'Built and maintained CI/CD pipelines with Jenkins and Terraform.',
        'Deployed containerized workloads on Kubernetes.',
      ],
    },
  ],
};

describe('applyRules', () => {
  test('missing rules block = no vetoes', () => {
    expect(applyRules(baseJob(), null)).toEqual({ veto: false, reason: null });
    expect(applyRules(baseJob(), undefined)).toEqual({ veto: false, reason: null });
  });

  test('onsite-only outside allowedOnsiteCities vetoes', () => {
    const r = applyRules(baseJob({ location: 'Chennai, India' }), RULES);
    expect(r).toEqual({ veto: true, reason: 'veto:onsite_city' });
  });

  test('onsite in an allowed city passes', () => {
    expect(applyRules(baseJob({ location: 'Bengaluru' }), RULES).veto).toBe(false);
  });

  test('remote location is never vetoed by allowedOnsiteCities', () => {
    expect(applyRules(baseJob({ location: 'Remote' }), RULES).veto).toBe(false);
  });

  test('vetoTitle regex match vetoes with a slugged reason', () => {
    const r = applyRules(baseJob({ title: 'L1 Support Engineer' }), RULES);
    expect(r.veto).toBe(true);
    expect(r.reason).toMatch(/^veto:/);
  });

  test('vetoText match on the description vetoes', () => {
    const r = applyRules(baseJob({ description: 'Rotational night shift required, 24x7 support queue.' }), RULES);
    expect(r).toEqual({ veto: true, reason: 'veto:rotational_night' });
  });

  test('minSeniority vetoes a junior/associate/intern title', () => {
    expect(applyRules(baseJob({ title: 'Junior DevOps Engineer' }), RULES).reason).toBe('veto:seniority');
    expect(applyRules(baseJob({ title: 'DevOps Intern' }), RULES).reason).toBe('veto:seniority');
  });

  test('employmentTypes allow-list vetoes a disallowed type, accepts null (unreported)', () => {
    expect(applyRules(baseJob({ employmentType: 'contract' }), RULES).reason).toBe('veto:employment_type');
    expect(applyRules(baseJob({ employmentType: null }), RULES).veto).toBe(false);
  });

  test('maxAgeDays vetoes a stale posting', () => {
    expect(applyRules(baseJob({ postedAt: days(60) }), RULES).reason).toBe('veto:stale');
    expect(applyRules(baseJob({ postedAt: days(10) }), RULES).veto).toBe(false);
  });

  test('a clean posting passes every rule', () => {
    expect(applyRules(baseJob(), RULES)).toEqual({ veto: false, reason: null });
  });
});

describe('lexicalScore', () => {
  test('returns a 0..1 score with a lexical:N.NN reason', () => {
    const { score, reason } = lexicalScore(baseJob(), PROFILE);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(reason).toMatch(/^lexical:\d\.\d\d$/);
  });

  test('orders a strong-match JD above a weak-match JD', () => {
    const strong = lexicalScore(
      baseJob({ description: 'Need AWS, Terraform, Kubernetes and Jenkins CI/CD experience.' }),
      PROFILE
    );
    const weak = lexicalScore(
      baseJob({ description: 'Looking for someone with PHP, WordPress, and Photoshop skills.' }),
      PROFILE
    );
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  test('empty JD scores 0', () => {
    expect(lexicalScore(baseJob({ description: '' }), PROFILE).score).toBe(0);
  });

  test('alias equivalence: k8s in the JD counts as a kubernetes hit', () => {
    const withAlias = lexicalScore(baseJob({ description: 'Strong k8s and iac experience required.' }), PROFILE);
    expect(withAlias.score).toBeGreaterThan(0);
  });
});

describe('prefilterJobs', () => {
  function seededDb() {
    const db = new Database(':memory:');
    runMigrations(db);
    db.prepare(`INSERT INTO companies (id, name) VALUES (1, 'Acme')`).run();

    const insert = db.prepare(`
      INSERT INTO jobs (id, company_id, ats_platform, title, location, description, employment_type, status, posted_at)
      VALUES (?, 1, 'greenhouse', ?, ?, ?, ?, 'active', ?)
    `);
    // Matches archetype + India + passes S1 + strong lexical overlap.
    insert.run('j:good', 'Senior DevOps Engineer', 'Pune',
      'Own AWS, Terraform, Kubernetes and Jenkins CI/CD pipelines.', 'full-time', days(1));
    // Matches archetype + India but vetoed (L1 support in title).
    insert.run('j:veto', 'L1 Support Engineer - DevOps', 'Pune', 'Ticket queue support.', 'full-time', days(1));
    // Matches archetype + India, weak lexical overlap, not vetoed.
    insert.run('j:weak', 'Senior DevOps Engineer', 'Mumbai', 'PHP and WordPress required.', 'full-time', days(1));
    // Does not match archetype at all — must be left untouched.
    insert.run('j:other', 'Senior Frontend Engineer', 'Pune', 'React and CSS.', 'full-time', days(1));
    // Matches archetype but not India — must be left untouched (S0's job, not S1/S2's).
    insert.run('j:notindia', 'Senior DevOps Engineer', 'London, UK', 'AWS and Terraform.', 'full-time', days(1));
    return db;
  }

  let db;
  beforeEach(() => { db = seededDb(); });

  test('scores/vetoes only active archetype+India jobs, leaves the rest untouched', () => {
    const result = prefilterJobs(db, { profile: PROFILE });
    expect(result).toEqual({ total: 3, vetoed: 1, scored: 2 });

    const good = db.prepare('SELECT prefilter_score, prefilter_reason FROM jobs WHERE id = ?').get('j:good');
    expect(good.prefilter_score).toBeGreaterThan(0);
    expect(good.prefilter_reason).toMatch(/^lexical:/);

    const veto = db.prepare('SELECT prefilter_score, prefilter_reason FROM jobs WHERE id = ?').get('j:veto');
    expect(veto.prefilter_score).toBe(0);
    expect(veto.prefilter_reason).toMatch(/^veto:/);

    const other = db.prepare('SELECT prefilter_score, prefilter_reason FROM jobs WHERE id = ?').get('j:other');
    expect(other.prefilter_score).toBeNull();
    expect(other.prefilter_reason).toBeNull();

    const notIndia = db.prepare('SELECT prefilter_score FROM jobs WHERE id = ?').get('j:notindia');
    expect(notIndia.prefilter_score).toBeNull();
  });

  test('missing rules block scores everything, vetoes nothing', () => {
    const profileNoRules = { ...PROFILE, rules: undefined };
    const result = prefilterJobs(db, { profile: profileNoRules });
    expect(result).toEqual({ total: 3, vetoed: 0, scored: 3 });
  });

  test('throws without a profile', () => {
    expect(() => prefilterJobs(db, {})).toThrow(/profile is required/);
  });
});
