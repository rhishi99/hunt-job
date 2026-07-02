import { describe, test, expect, vi, afterEach } from 'vitest';
import { JobEvaluator, classifyJobInput, resolveJobText, formatSalaryRange } from '../src/core/jobEvaluator.js';

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
