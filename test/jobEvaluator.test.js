import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { JobEvaluator, classifyJobInput, resolveJobText, formatSalaryRange } from '../src/core/jobEvaluator.js';
import { runMigrations } from '../src/core/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Scoring v2 (docs/fable51-answers.md §3): evaluate() now extracts via
// scoring/extract.js instead of prompting the LLM for a score directly.
// Stubbing extractFacts here means these tests never make a real LLM call —
// scoring itself (validate/score/narrative) runs for real against the
// fixture's hand-checked facts.
const extractFacts = vi.fn();
vi.mock('../src/core/scoring/extract.js', () => ({ extractFacts: (...args) => extractFacts(...args) }));

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/scoring', `${name}.json`), 'utf-8'));
}

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

const testProfile = {
  archetypes: ['DevOps Engineer'],
  salary: { min: 40, max: 70, currency: 'INR', unit: 'LPA' },
  techStack: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD', 'Docker', 'Ansible'],
  skillGroups: {},
  remotePreference: 'remote',
  dealbreakers: [],
  yearsOfExperience: 15,
  rules: {
    allowedOnsiteCities: ['Pune', 'Mumbai', 'Bangalore', 'Bengaluru'],
    employmentTypes: ['full-time', null],
  },
};

describe('parseEvaluationResponse', () => {
  test('parses valid JSON', () => {
    const result = JobEvaluator.parseEvaluationResponse(
      '{"overallScore":4.2,"dimensions":{"techStack":5},"recommendation":"Apply"}'
    );
    expect(result.overallScore).toBe(4.2);
    expect(result.dimensions.techStack).toBe(5);
    expect(result.recommendation).toBe('Apply');
  });

  test('parses JSON wrapped in markdown fences', () => {
    const result = JobEvaluator.parseEvaluationResponse('```json\n{"overallScore":3,"recommendation":"Maybe"}\n```');
    expect(result.overallScore).toBe(3);
    expect(result.recommendation).toBe('Maybe');
  });

  test('falls back to analysis shape on truncated/invalid JSON', () => {
    const raw = '{"overallScore":4.2, "dimensions": {"salary": 3,';
    const result = JobEvaluator.parseEvaluationResponse(raw);
    expect(result.overallScore).toBe(0);
    expect(result.dimensions).toEqual({});
    expect(result.recommendation).toBe('REVIEW');
    expect(result.analysis).toBe(raw);
  });

  test('falls back to analysis shape on plain prose (no JSON at all)', () => {
    const raw = 'This looks like a solid backend role for the candidate.';
    const result = JobEvaluator.parseEvaluationResponse(raw);
    expect(result.overallScore).toBe(0);
    expect(result.recommendation).toBe('REVIEW');
    expect(result.analysis).toBe(raw);
  });
});

describe('classifyJobInput (URL routing for P1 fetch-before-LLM)', () => {
  test('pasted text is not treated as a URL', () => {
    expect(classifyJobInput('We are hiring a backend engineer...')).toEqual({ type: 'text' });
  });

  test('detects Lever URLs', () => {
    const c = classifyJobInput('https://jobs.lever.co/acme/1234abcd-5678-ef90-ab12-34cd56ef78ab');
    expect(c.type).toBe('lever');
    expect(c.company).toBe('acme');
  });

  test('detects boards.greenhouse.io URLs', () => {
    const c = classifyJobInput('https://boards.greenhouse.io/acme/jobs/98765');
    expect(c.type).toBe('greenhouse');
    expect(c.board).toBe('acme');
    expect(c.id).toBe('98765');
  });

  test('detects job-boards.greenhouse.io URLs', () => {
    const c = classifyJobInput('https://job-boards.greenhouse.io/acme/jobs/98765');
    expect(c.type).toBe('greenhouse');
    expect(c.board).toBe('acme');
  });

  test('any other URL is generic', () => {
    const c = classifyJobInput('https://careers.example.com/role/123');
    expect(c.type).toBe('generic');
  });
});

describe('formatSalaryRange (P6 currency)', () => {
  test('defaults to rupee symbol and LPA unit', () => {
    expect(formatSalaryRange(undefined)).toBe('₹0 - ₹0 LPA');
  });

  test('uses profile currency + unit verbatim when present', () => {
    expect(formatSalaryRange({ min: 10, max: 20, currency: 'INR', unit: 'LPA' })).toBe('INR10 - INR20 LPA');
  });

  test('does not force LPA onto non-rupee currencies', () => {
    expect(formatSalaryRange({ min: 100, max: 150, currency: '$' })).toBe('$100 - $150');
  });
});

describe('resolveJobText (P1: never send a bare URL to the LLM)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('pasted text passes through unfetched', async () => {
    const result = await resolveJobText('A long pasted job description with enough content.');
    expect(result.fetched).toBe(false);
    expect(result.sourceType).toBe('text');
  });

  test('generic URL: extracts JSON-LD JobPosting when present', async () => {
    const html = `<html><body><script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Senior Backend Engineer',
      hiringOrganization: { name: 'Acme Corp' },
      jobLocation: { address: { addressLocality: 'Bangalore' } },
      description: '<p>' + 'Build scalable systems. '.repeat(30) + '</p>',
    })}</script></body></html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }));

    const result = await resolveJobText('https://careers.example.com/role/123');
    expect(result.fetched).toBe(true);
    expect(result.sourceType).toBe('jsonld');
    expect(result.jobText).toContain('Senior Backend Engineer');
    expect(result.jobText).toContain('Acme Corp');
  });

  test('generic URL: throws instead of sending a near-empty page to the LLM', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<html><body>Coming soon</body></html>') }));

    await expect(resolveJobText('https://careers.example.com/role/123')).rejects.toThrow(/paste the job description/i);
  });

  test('generic URL: throws when the fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(resolveJobText('https://careers.example.com/role/123')).rejects.toThrow(/paste the job description/i);
  });
});

describe('evaluate() — scoring v2 (docs/fable51-answers.md §3)', () => {
  const fixture = loadFixture('devops-remote-senior');

  beforeEach(() => {
    extractFacts.mockReset();
    extractFacts.mockResolvedValue({ facts: fixture.expected, raw: '{}' });
  });
  afterEach(() => vi.unstubAllGlobals());

  test('pasted text: extracts, scores, and persists a v5 evaluations row', async () => {
    const db = freshDb();
    const evaluator = new JobEvaluator();

    const result = await evaluator.evaluate(fixture.jobText, testProfile, { db });

    expect(extractFacts).toHaveBeenCalledTimes(1);
    expect(result.evaluation.recommendation).toBe('Apply');
    expect(result.evaluation.overallScore).toBeGreaterThanOrEqual(4.0);
    expect(result.reused).toBe(false);

    const row = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(result.id);
    expect(row.job_id).toBe(result.jobId);
    expect(row.score_version).toBe(1);
    expect(row.recommendation).toBe('Apply');
    expect(JSON.parse(row.extraction).role_title.value).toBe('Senior DevOps Engineer');
  });

  test('B-25: a URL already scanned into `jobs` is scored from its stored description — no fetch', async () => {
    const db = freshDb();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const url = 'https://boards.greenhouse.io/acme/jobs/999';
    const now = Date.now();
    db.prepare(`
      INSERT INTO jobs (id, company_id, ats_platform, title, url, description, content_hash, status, first_seen_at, last_seen_at)
      VALUES ('greenhouse:acme:999', 'acme', 'greenhouse', 'Senior DevOps Engineer', ?, ?, 'hash1', 'active', ?, ?)
    `).run(url, fixture.jobText, now, now);

    const evaluator = new JobEvaluator();
    const result = await evaluator.evaluate(url, testProfile, { db });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.jobId).toBe('greenhouse:acme:999');
    expect(result.evaluation.recommendation).toBe('Apply');
  });

  test('B-18: reuse — same (job_id, content_hash, profile_hash, score_version) hits no LLM the second time', async () => {
    const db = freshDb();
    const evaluator = new JobEvaluator();

    const first = await evaluator.evaluate(fixture.jobText, testProfile, { db });
    expect(extractFacts).toHaveBeenCalledTimes(1);

    const second = await evaluator.evaluate(fixture.jobText, testProfile, { db });
    expect(extractFacts).toHaveBeenCalledTimes(1); // no additional call
    expect(second.reused).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.evaluation.overallScore).toBe(first.evaluation.overallScore);
  });

  test('--fresh bypasses reuse and re-extracts', async () => {
    const db = freshDb();
    const evaluator = new JobEvaluator();

    await evaluator.evaluate(fixture.jobText, testProfile, { db });
    expect(extractFacts).toHaveBeenCalledTimes(1);

    const fresh = await evaluator.evaluate(fixture.jobText, testProfile, { db, fresh: true });
    expect(extractFacts).toHaveBeenCalledTimes(2);
    expect(fresh.reused).toBe(false);
  });

  test('a vetoing extraction (night shift) scores 0 and recommends Skip', async () => {
    const vetoFixture = loadFixture('support-l1-nightshift');
    extractFacts.mockResolvedValue({ facts: vetoFixture.expected, raw: '{}' });

    const db = freshDb();
    const evaluator = new JobEvaluator();
    const result = await evaluator.evaluate(vetoFixture.jobText, testProfile, { db });

    expect(result.evaluation.overallScore).toBe(0);
    expect(result.evaluation.recommendation).toBe('Skip');
    expect(result.evaluation.vetoed).toBe(true);
  });

  test('dimensions use canonical keys from settings.json evaluation.dimensions (B-26)', async () => {
    const db = freshDb();
    const evaluator = new JobEvaluator();
    const result = await evaluator.evaluate(fixture.jobText, testProfile, { db });

    const keys = Object.keys(result.evaluation.dimensions);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(['skill_fit', 'seniority_fit', 'location_fit', 'salary_fit', 'role_scope', 'freshness']).toContain(key);
    }
  });
});
