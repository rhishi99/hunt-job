import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NORMALIZED_JOB_KEYS } from '../../src/core/scan/normalize.js';
import { parse as parseGreenhouse } from '../../src/core/scan/providers/greenhouse.js';
import { parse as parseLever } from '../../src/core/scan/providers/lever.js';
import { parse as parseAshby } from '../../src/core/scan/providers/ashby.js';
import { parsePage as parseSmartRecruiters } from '../../src/core/scan/providers/smartrecruiters.js';
import { parse as parseRecruitee } from '../../src/core/scan/providers/recruitee.js';
import { parse as parseWorkable } from '../../src/core/scan/providers/workable.js';
import { parse as parseJsonld } from '../../src/core/scan/providers/jsonld.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures/ats');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, `${name}.json`), 'utf-8'));
}

function loadHtmlFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, `${name}.html`), 'utf-8');
}

function expectNormalizedShape(job) {
  expect(Object.keys(job).sort()).toEqual([...NORMALIZED_JOB_KEYS].sort());
}

describe('greenhouse provider', () => {
  const companyRef = { slug: 'gitlab', name: 'GitLab', location: 'Remote-India' };
  const jobs = parseGreenhouse(loadFixture('greenhouse'), companyRef);

  test('parses every job in the fixture', () => {
    const raw = loadFixture('greenhouse');
    expect(jobs.length).toBe(raw.jobs.length);
    expect(jobs.length).toBeGreaterThan(0);
  });

  test('maps fields correctly and strips entity-encoded HTML content', () => {
    const first = jobs[0];
    expect(first.id).toBe('greenhouse:gitlab:8503792002');
    expect(first.title).toBe('Account Executive - Italy');
    expect(first.location).toBe('Remote, Italy');
    expect(first.url).toBe('https://job-boards.greenhouse.io/gitlab/jobs/8503792002');
    expect(first.applyUrl).toBe(first.url);
    expect(first.source).toBe('greenhouse');
    expect(typeof first.postedAt).toBe('number');
    // content field arrives entity-encoded ("&lt;div&gt;...") — cleanHtml must decode + strip it
    expect(first.description).not.toMatch(/&lt;|&gt;|<[a-z]/i);
    expect(first.description).toContain('GitLab is the intelligent orchestration platform');
  });

  test('every job matches the NormalizedJob contract', () => {
    jobs.forEach(expectNormalizedShape);
  });

  test('returns [] when the board has no jobs array', () => {
    expect(parseGreenhouse({}, companyRef)).toEqual([]);
  });
});

describe('lever provider', () => {
  const companyRef = { slug: 'paytm', name: 'Paytm', location: 'Noida' };
  const raw = loadFixture('lever');
  const jobs = parseLever(raw, companyRef);

  test('parses every job in the fixture', () => {
    expect(jobs.length).toBe(raw.length);
    expect(jobs.length).toBeGreaterThan(0);
  });

  test('maps fields correctly', () => {
    const first = jobs[0];
    expect(first.id).toBe(`lever:paytm:${raw[0].id}`);
    expect(first.title).toBe(raw[0].text);
    expect(first.location).toBe(raw[0].categories.location);
    expect(first.url).toBe(raw[0].hostedUrl);
    expect(first.applyUrl).toBe(raw[0].applyUrl);
    expect(first.postedAt).toBe(raw[0].createdAt);
    expect(first.description.length).toBeGreaterThan(0);
    expect(first.description).not.toMatch(/<[a-z]/i);
  });

  test('every job matches the NormalizedJob contract', () => {
    jobs.forEach(expectNormalizedShape);
  });

  test('returns [] for a non-array payload', () => {
    expect(parseLever(null, companyRef)).toEqual([]);
  });
});

describe('ashby provider', () => {
  const companyRef = { slug: 'openai', name: 'OpenAI', location: null };
  const raw = loadFixture('ashby');
  const jobs = parseAshby(raw, companyRef);

  test('parses every job in the fixture', () => {
    expect(jobs.length).toBe(raw.jobs.length);
  });

  test('maps fields correctly', () => {
    const first = jobs[0];
    expect(first.id).toBe(`ashby:openai:${raw.jobs[0].id}`);
    expect(first.title).toBe(raw.jobs[0].title);
    expect(first.url).toBe(raw.jobs[0].jobUrl);
    expect(first.applyUrl).toBe(raw.jobs[0].applyUrl);
    expect(first.location).toBe(raw.jobs[0].location);
    expect(first.postedAt).toBe(new Date(raw.jobs[0].publishedAt).getTime());
    expect(first.description).not.toMatch(/<[a-z]/i);
  });

  test('every job matches the NormalizedJob contract', () => {
    jobs.forEach(expectNormalizedShape);
  });
});

describe('smartrecruiters provider', () => {
  const companyRef = { slug: 'Visa', name: 'Visa', location: null };
  const raw = loadFixture('smartrecruiters');
  const jobs = parseSmartRecruiters(raw.content, companyRef);

  test('parses every posting in the fixture', () => {
    expect(jobs.length).toBe(raw.content.length);
  });

  test('maps fields correctly (postings-list endpoint has no description body)', () => {
    const first = jobs[0];
    expect(first.id).toBe(`smartrecruiters:Visa:${raw.content[0].id}`);
    expect(first.title).toBe(raw.content[0].name);
    expect(first.location).toBe(raw.content[0].location.fullLocation);
    expect(first.url).toContain(raw.content[0].id);
    expect(first.postedAt).toBe(new Date(raw.content[0].releasedDate).getTime());
    expect(first.description.length).toBeGreaterThan(0);
  });

  test('every job matches the NormalizedJob contract', () => {
    jobs.forEach(expectNormalizedShape);
  });
});

describe('recruitee provider', () => {
  const companyRef = { slug: 'shypple', name: 'Shypple', location: null };
  const raw = loadFixture('recruitee');
  const jobs = parseRecruitee(raw, companyRef);

  test('parses every offer in the fixture', () => {
    expect(jobs.length).toBe(raw.offers.length);
  });

  test('maps fields correctly and parses the "YYYY-MM-DD HH:MM:SS UTC" date format', () => {
    const first = jobs[0];
    expect(first.id).toBe(`recruitee:shypple:${raw.offers[0].id}`);
    expect(first.title).toBe(raw.offers[0].title);
    expect(first.url).toBe(raw.offers[0].careers_url);
    expect(first.applyUrl).toBe(raw.offers[0].careers_apply_url);
    expect(typeof first.postedAt).toBe('number');
    expect(first.description).not.toMatch(/<[a-z]/i);
  });

  test('every job matches the NormalizedJob contract', () => {
    jobs.forEach(expectNormalizedShape);
  });
});

describe('workable provider', () => {
  const companyRef = { slug: 'shypple', name: 'Shypple', location: null };

  test('returns [] for the captured fixture (empty jobs array)', () => {
    const raw = loadFixture('workable');
    expect(parseWorkable(raw, companyRef)).toEqual([]);
  });

  test('maps a documented-shape job (no live fixture available)', () => {
    const synthetic = {
      jobs: [{
        title: 'Backend Engineer',
        shortcode: 'ABC123',
        department: 'Engineering',
        url: 'https://apply.workable.com/shypple/j/ABC123/',
        application_url: 'https://apply.workable.com/shypple/j/ABC123/apply/',
        published_on: '2026-06-01',
        city: 'Bangalore',
        country: 'India',
      }],
    };
    const jobs = parseWorkable(synthetic, companyRef);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('workable:shypple:ABC123');
    expect(jobs[0].location).toBe('Bangalore, India');
    expect(jobs[0].applyUrl).toBe(synthetic.jobs[0].application_url);
    expectNormalizedShape(jobs[0]);
  });
});

describe('jsonld fallback provider', () => {
  const companyRef = { slug: 'acme', name: 'Acme Corp', career_url: 'https://careers.acme.example.com' };
  const html = loadHtmlFixture('jsonld-sample');
  const jobs = parseJsonld(html, companyRef);

  test('parses both JobPosting blocks (plain object + @graph array), skipping the malformed one', () => {
    expect(jobs).toHaveLength(2);
  });

  test('maps the plain-object JobPosting correctly', () => {
    const first = jobs.find(j => j.title === 'Senior DevOps Engineer');
    expect(first.id).toBe('jsonld:acme:' + first.id.split(':')[2]); // hash present, format correct
    expect(first.id.split(':')).toHaveLength(3);
    expect(first.source).toBe('jsonld');
    expect(first.company).toBe('Acme Corp');
    expect(first.location).toBe('Bengaluru, Karnataka, IN');
    expect(first.url).toBe('https://careers.acme.example.com/jobs/senior-devops-engineer');
    expect(first.applyUrl).toBe(first.url);
    expect(typeof first.postedAt).toBe('number');
    expect(first.description).not.toMatch(/<[a-z]/i);
    expect(first.description).toContain('Own our CI/CD pipeline');
  });

  test('maps the @graph-wrapped JobPosting correctly, ignoring the sibling Organization node', () => {
    const second = jobs.find(j => j.title === 'Platform SRE');
    expect(second).toBeTruthy();
    expect(second.location).toBe('Pune, Maharashtra, IN');
    expect(second.url).toBe('https://careers.acme.example.com/jobs/platform-sre');
  });

  test('every job matches the NormalizedJob contract', () => {
    jobs.forEach(expectNormalizedShape);
  });

  test('returns [] for HTML with no JSON-LD blocks', () => {
    expect(parseJsonld('<html><body>no jobs here</body></html>', companyRef)).toEqual([]);
  });

  test('produces stable ids for the same url (hash-based, dedupable)', () => {
    const again = parseJsonld(html, companyRef);
    expect(again[0].id).toBe(jobs[0].id);
  });
});
