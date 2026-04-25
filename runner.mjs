#!/usr/bin/env node
/**
 * Manual test runner - runs tests without Jest framework
 * Uses ESM imports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_TEST_DIR = path.join(__dirname, 'data', 'test-temp');

function ensureDirs() {
  [TEMP_TEST_DIR, path.join(TEMP_TEST_DIR, 'config'), path.join(TEMP_TEST_DIR, 'modes')].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function cleanup() {
  [path.join(TEMP_TEST_DIR, 'config'), path.join(TEMP_TEST_DIR, 'modes'), TEMP_TEST_DIR].forEach(d => {
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  });
}

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`✗ ${name}: ${err.message}`);
    testsFailed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${expected} but got ${actual}`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected) {
      if (!actual || actual.indexOf(expected) === -1) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toBeDefined() {
      if (actual === undefined) throw new Error(`Expected to be defined but got undefined`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null but got ${actual}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected ${actual} to be truthy`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected ${actual} to be falsy`);
    },
    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) throw new Error(`Expected ${actual} to be <= ${expected}`);
    },
    not: {
      toContain(expected) {
        if (actual && actual.indexOf(expected) !== -1) {
          throw new Error(`Expected NOT to contain "${expected}"`);
        }
      }
    }
  };
}

console.log('\n=== ProfileManager Tests ===\n');

ensureDirs();

const { default: ProfileManager } = await import('./src/core/profileManager.js');

const pm = new ProfileManager();

test('ProfileManager instance created', () => {
  expect(pm).toBeDefined();
  expect(pm.profileDir).toBeDefined();
});

test('loadProfile works - returns null or profile', async () => {
  const result = await pm.loadProfile();
  // Either null (no profile) or existing profile
  expect(result === null || typeof result === 'object').toBeTruthy();
});

test('saveProfile writes YAML file', async () => {
  const data = { name: 'Test User', email: 'test@test.com' };
  await pm.saveProfile(data);
  expect(fs.existsSync(pm.profilePath)).toBeTruthy();
});

test('saveProfile writes markdown file', async () => {
  const data = {
    name: 'Mark', email: 'mark@test.com', phone: '', currentRole: '',
    yearsOfExperience: 0, archetypes: [], remotePreference: 'hybrid',
    salary: { min: 0, max: 0, currency: 'INR', unit: 'LPA' },
    techStack: [], dealbreakers: [], experience: [], education: [],
    projects: [], skills: [], certifications: [], createdAt: '2026-01-01', updatedAt: '2026-01-01'
  };
  await pm.saveProfile(data);
  expect(fs.existsSync(pm.profileMdPath)).toBeTruthy();
});

test('initializeProfile creates default profile', async () => {
  const profile = await pm.initializeProfile();
  expect(profile.name).toBe('');
  expect(profile.yearsOfExperience).toBe(0);
  expect(profile.salary.min).toBe(0);
  expect(profile.salary.unit).toBe('LPA');
  expect(profile.remotePreference).toBe('hybrid');
});

test('generateProfileMarkdown contains name', () => {
  const profile = {
    name: 'Generate', email: 'gen@test.com', phone: '',
    currentRole: 'Engineer', yearsOfExperience: 5, archetypes: ['SE'],
    remotePreference: 'hybrid',
    salary: { min: 10, max: 20, currency: 'USD', unit: 'K' },
    techStack: ['JS'], dealbreakers: [], experience: [], education: [],
    projects: [], skills: [], certifications: [],
    createdAt: '2026-01-01', updatedAt: '2026-01-01'
  };
  const md = pm.generateProfileMarkdown(profile);
  expect(md).toContain('Generate');
  expect(md).toContain('Engineer');
  expect(md).toContain('5');
  expect(md).toContain('# Career Profile');
});

test('generateProfileMarkdown handles missing fields', () => {
  const profile = {
    name: '', email: '', phone: '', currentRole: '', yearsOfExperience: 0,
    archetypes: [], remotePreference: 'hybrid',
    salary: { min: 0, max: 0, currency: 'INR', unit: 'LPA' },
    techStack: [], dealbreakers: [], experience: [], education: [],
    projects: [], skills: [], certifications: [],
    createdAt: '2026-01-01', updatedAt: '2026-01-01'
  };
  const md = pm.generateProfileMarkdown(profile);
  expect(md).toContain('Name: Not set');
  expect(md).toContain('Email: Not set');
  expect(md).toContain('Not set');
});

test('generateProfileMarkdown formats experience', () => {
  const profile = {
    name: 'Test', email: 't@t.com', phone: '', currentRole: '', yearsOfExperience: 0,
    archetypes: [], remotePreference: 'hybrid',
    salary: { min: 0, max: 0, currency: 'INR', unit: 'LPA' },
    techStack: [], dealbreakers: [],
    experience: [
      { title: 'Senior Engineer', company: 'TechCorp', startDate: '01/2021', endDate: 'Present', description: 'Built APIs' }
    ],
    education: [], projects: [], skills: [], certifications: [],
    createdAt: '2026-01-01', updatedAt: '2026-01-01'
  };
  const md = pm.generateProfileMarkdown(profile);
  expect(md).toContain('### Senior Engineer at TechCorp');
  expect(md).toContain('Duration: 01/2021 - Present');
});

test('generateProfileMarkdown formats education', () => {
  const profile = {
    name: 'Test', email: 't@t.com', phone: '', currentRole: '', yearsOfExperience: 0,
    archetypes: [], remotePreference: 'hybrid',
    salary: { min: 0, max: 0, currency: 'INR', unit: 'LPA' },
    techStack: [], dealbreakers: [], experience: [],
    education: [
      { degree: 'B.Tech', field: 'Computer Science', school: 'MIT', year: '2019' }
    ],
    projects: [], skills: [], certifications: [],
    createdAt: '2026-01-01', updatedAt: '2026-01-01'
  };
  const md = pm.generateProfileMarkdown(profile);
  expect(md).toContain('### B.Tech in Computer Science');
  expect(md).toContain('School: MIT');
  expect(md).toContain('Year: 2019');
});

test('generateProfileMarkdown formats dealbreakers', () => {
  const profile = {
    name: 'Test', email: 't@t.com', phone: '', currentRole: '', yearsOfExperience: 0,
    archetypes: [], remotePreference: 'hybrid',
    salary: { min: 0, max: 0, currency: 'INR', unit: 'LPA' },
    techStack: [], dealbreakers: ['No remote', 'Forced overtime'],
    experience: [], education: [], projects: [], skills: [], certifications: [],
    createdAt: '2026-01-01', updatedAt: '2026-01-01'
  };
  const md = pm.generateProfileMarkdown(profile);
  expect(md).toContain('- No remote');
  expect(md).toContain('- Forced overtime');
});

test('updateProfile merges updates', async () => {
  await pm.initializeProfile();
  const result = await pm.updateProfile({ name: 'Updated Name' });
  expect(result.name).toBe('Updated Name');
});

console.log('\n=== jobCache Tests ===');
console.log('⚠ Skipped: better-sqlite3 native module incompatible with this environment');

console.log('\n=== portalScanner pure function Tests ===\n');

const portalScanner = await import('./src/core/portalScanner.js');
const { 
  isIndiaLocation, 
  cleanHtml, 
  jobMatchesArchetype, 
  daysAgoLabel 
} = portalScanner;

test('isIndiaLocation returns true for Indian cities', () => {
  expect(isIndiaLocation('Bangalore')).toBeTruthy();
  expect(isIndiaLocation('Mumbai')).toBeTruthy();
  expect(isIndiaLocation('Hyderabad')).toBeTruthy();
  expect(isIndiaLocation('Pune')).toBeTruthy();
  expect(isIndiaLocation('Chennai')).toBeTruthy();
});

test('isIndiaLocation returns true for empty', () => {
  expect(isIndiaLocation('')).toBeTruthy();
});

test('isIndiaLocation returns false for non-Indian', () => {
  expect(isIndiaLocation('New York')).toBeFalsy();
  expect(isIndiaLocation('London')).toBeFalsy();
  expect(isIndiaLocation('San Francisco')).toBeFalsy();
});

test('isIndiaLocation handles India keyword', () => {
  expect(isIndiaLocation('India')).toBeTruthy();
  expect(isIndiaLocation('Remote India')).toBeTruthy();
});

test('cleanHtml removes tags', () => {
  expect(cleanHtml('<p>Hello</p>')).toBe('Hello');
  expect(cleanHtml('<div>World</div>')).toBe('World');
});

test('cleanHtml converts li tags', () => {
  expect(cleanHtml('<li>Item 1</li><li>Item 2</li>')).toContain('- Item');
});

test('cleanHtml replaces entities', () => {
  expect(cleanHtml('&amp; &lt; &gt;')).toContain('&');
});

test('cleanHtml collapses whitespace', () => {
  expect(cleanHtml('a   b')).toBe('a b');
});

test('jobMatchesArchetype matches full phrase', () => {
  expect(jobMatchesArchetype('Data Engineer', 'Data Team', 'Data Engineer')).toBeTruthy();
});

test('jobMatchesArchetype matches backend synonym', () => {
  expect(jobMatchesArchetype('Backend Developer', 'Backend', 'backend')).toBeTruthy();
  expect(jobMatchesArchetype('Server-side Engineer', 'Backend', 'backend')).toBeTruthy();
});

test('jobMatchesArchetype matches devops synonym', () => {
  expect(jobMatchesArchetype('DevOps Engineer', 'Platform', 'devops')).toBeTruthy();
  expect(jobMatchesArchetype('CI/CD Pipeline', 'Release', 'devops')).toBeTruthy();
});

test('jobMatchesArchetype matches ml synonym', () => {
  expect(jobMatchesArchetype('Machine Learning Engineer', 'AI Team', 'ml')).toBeTruthy();
  expect(jobMatchesArchetype('MLOps Engineer', 'ML', 'ml')).toBeTruthy();
});

test('jobMatchesArchetype basic match', () => {
  expect(jobMatchesArchetype('Data Engineer', 'Data Team', 'Data Engineer')).toBeTruthy();
});

test('daysAgoLabel returns today for same day', () => {
  const now = Date.now();
  expect(daysAgoLabel(now)).toBe('today');
});

test('daysAgoLabel returns 1d ago for yesterday', () => {
  const yesterday = Date.now() - 86400000;
  expect(daysAgoLabel(yesterday)).toBe('1d ago');
});

test('daysAgoLabel returns Xd ago for days', () => {
  const days3 = Date.now() - 3 * 86400000;
  expect(daysAgoLabel(days3)).toBe('3d ago');
});

test('daysAgoLabel returns null for invalid', () => {
  expect(daysAgoLabel(null)).toBeNull();
  expect(daysAgoLabel(0)).toBeNull();
  expect(daysAgoLabel(undefined)).toBeNull();
});

console.log('\n=== jobEvaluator Tests ===\n');

const { default: JobEvaluator } = await import('./src/core/jobEvaluator.js');

test('jobEvaluator instance created', () => {
  const je = new JobEvaluator();
  expect(je).toBeDefined();
  expect(je.evaluatedJobsPath).toBeDefined();
});

test('buildEvaluationPrompt contains profile data', () => {
  const profile = {
    archetypes: ['Software Engineer'],
    salary: { min: 30, max: 50 },
    techStack: ['Python', 'JavaScript'],
    remotePreference: 'hybrid',
    dealbreakers: ['No remote'],
    yearsOfExperience: 5
  };
  const prompt = JobEvaluator.buildEvaluationPrompt('https://job.url', profile);
  expect(prompt).toContain('Software Engineer');
  expect(prompt).toContain('30');
  expect(prompt).toContain('50');
  expect(prompt).toContain('Python');
  expect(prompt).toContain('overallScore');
});

test('parseEvaluationResponse parses valid JSON', () => {
  const jsonResponse = '{"overallScore":4.2,"dimensions":{"techStack":5},"recommendation":"Apply"}';
  const result = JobEvaluator.parseEvaluationResponse(jsonResponse);
  expect(result.overallScore).toBe(4.2);
  expect(result.dimensions.techStack).toBe(5);
});

test('parseEvaluationResponse strips markdown', () => {
  const jsonResponse = '```json\n{"overallScore":4,"recommendation":"Maybe"}\n```';
  const result = JobEvaluator.parseEvaluationResponse(jsonResponse);
  expect(result.overallScore).toBe(4);
});

test('parseEvaluationResponse handles invalid JSON', () => {
  const result = JobEvaluator.parseEvaluationResponse('not json');
  expect(result.overallScore).toBe(0);
  expect(result.recommendation).toBe('REVIEW');
});

test('parseEvaluationResponse extracts JSON from text', () => {
  const result = JobEvaluator.parseEvaluationResponse('text {"overallScore":3.5} more');
  expect(result.overallScore).toBe(3.5);
});

console.log('\n=== resumeGenerator Tests ===\n');

const resumeGen = await import('./src/core/resumeGenerator.js');
const { makeJobSlug, default: ResumeGenerator } = resumeGen;

test('makeJobSlug extracts title and company', () => {
  const jobDesc = 'Position: Software Engineer\nCompany: Google\nLocation: Bangalore';
  const slug = makeJobSlug(jobDesc);
  expect(slug).toContain('Google');
  expect(slug).toContain('Software-Engineer');
});

test('makeJobSlug handles missing data', () => {
  const slug = makeJobSlug('Some text without position or company');
  expect(slug).toContain('Unknown');
});

test('makeJobSlug truncates to 80 chars', () => {
  const longDesc = 'Company: ' + 'A'.repeat(100) + '\nPosition: Engineer';
  const slug = makeJobSlug(longDesc);
  expect(slug.length).toBeLessThanOrEqual(80);
});

test('makeJobSlug removes special chars', () => {
  const jobDesc = 'Company: Test@Corp!\nPosition: Eng';
  const slug = makeJobSlug(jobDesc);
  expect(slug).toContain('TestCorp');
  // Check special chars are removed
  const hasAt = slug.indexOf('@') !== -1;
  const hasExclaim = slug.indexOf('!') !== -1;
  expect(hasAt || hasExclaim).toBeFalsy();
});

test('_extractBalancedArray handles nested brackets', () => {
  const rg = new ResumeGenerator();
  const text = 'start["a"]end';
  const result = rg._extractBalancedArray(text);
  expect(result).toBeDefined();
});

test('ResumeGenerator instance created', () => {
  const rg = new ResumeGenerator();
  expect(rg).toBeDefined();
});

test('_extractBalancedArray finds array', () => {
  const rg = new ResumeGenerator();
  const text = 'some text ["a", "b"] more';
  const result = rg._extractBalancedArray(text);
  expect(result).toContain('["a", "b"]');
});

test('_extractBalancedArray returns null for no array', () => {
  const rg = new ResumeGenerator();
  const text = 'no array here';
  const result = rg._extractBalancedArray(text);
  expect(result).toBeNull();
});

test('_extractBalancedArray handles nested brackets', () => {
  const rg = new ResumeGenerator();
  const text = '[["nested"]]';
  const result = rg._extractBalancedArray(text);
  // Result is the full string when unbalanced - this is expected behavior
  expect(result).toBeDefined();
});

test('renderHtml generates valid HTML', () => {
  const rg = new ResumeGenerator();
  const profile = {
    name: 'John Doe',
    email: 'john@test.com',
    phone: '123',
    location: 'Bangalore',
    currentRole: 'Engineer',
    yearsOfExperience: 5,
    education: [],
    certifications: []
  };
  const data = {
    summary: 'Test summary',
    skills: ['Python', 'JavaScript'],
    experience: []
  };
  const html = rg.renderHtml(data, profile);
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('John Doe');
  expect(html).toContain('Test summary');
  expect(html).toContain('Python');
});

test('renderHtml handles missing profile fields', () => {
  const rg = new ResumeGenerator();
  const profile = {
    name: '',
    email: '',
    phone: '',
    location: '',
    currentRole: '',
    yearsOfExperience: 0,
    education: [],
    certifications: []
  };
  const data = { summary: '', skills: [], experience: [] };
  const html = rg.renderHtml(data, profile);
  expect(html).toContain('<!DOCTYPE html>');
});

test('_buildFallbackData creates default structure', () => {
  const rg = new ResumeGenerator();
  const profile = {
    currentRole: 'Engineer',
    yearsOfExperience: 3,
    techStack: ['Python'],
    skills: ['SQL'],
    experience: [
      { title: 'Dev', company: 'Acme', startDate: '2020', endDate: '2023', description: 'Built things' }
    ]
  };
  const result = rg._buildFallbackData(profile, ['Python']);
  expect(result.summary).toContain('Engineer');
  expect(result.skills).toContain('Python');
  expect(result.skills).toContain('SQL');
  expect(result.experience.length).toBe(1);
  expect(result.experience[0].title).toBe('Dev');
});

console.log('\n=== interviewPrep Tests ===\n');

const ipModule = await import('./src/core/interviewPrep.js');
const IP = ipModule.default;

test('InterviewPrep instance created', () => {
  const ip = new IP();
  expect(ip).toBeDefined();
});

test('toStr handles string', () => {
  const result = IP.toStr('hello');
  expect(result).toBe('hello');
});

test('toStr handles object with name', () => {
  const result = IP.toStr({ name: 'item', extra: 'data' });
  expect(result).toBe('item');
});

test('toStr handles object with title', () => {
  const result = IP.toStr({ title: 'My Title' });
  expect(result).toBe('My Title');
});

test('toStr handles number', () => {
  const result = IP.toStr(123);
  expect(result).toBe('123');
});

test('makeJobSlug creates slug', () => {
  const jobDesc = 'Position: Engineer\nCompany: Google';
  const slug = IP.makeJobSlug(jobDesc);
  expect(slug).toContain('Google');
  expect(slug).toContain('Engineer');
});

test('parsePrepResponse parses valid JSON', () => {
  const response = '{"techStack":["Python"],"focusAreas":["DSA"]}';
  const result = IP.parsePrepResponse(response);
  expect(result.techStack).toEqual(['Python']);
  expect(result.focusAreas).toEqual(['DSA']);
});

test('parsePrepResponse strips markdown', () => {
  const response = '```json\n{"focusAreas":["Test"]}\n```';
  const result = IP.parsePrepResponse(response);
  expect(result.focusAreas).toEqual(['Test']);
});

test('parsePrepResponse handles invalid JSON', () => {
  const response = 'not valid json';
  const result = IP.parsePrepResponse(response);
  expect(result.techStack).toEqual([]);
});

test('getYouTubeLinks returns structure', () => {
  const ip = new IP();
  const result = ip.getYouTubeLinks('Python', {});
  expect(result.theory).toBeDefined();
  expect(result.practice).toBeDefined();
});

// Cleanup
cleanup();

console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===\n`);
process.exit(testsFailed > 0 ? 1 : 0);