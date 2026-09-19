import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NORMALIZED_JOB_KEYS } from '../../src/core/scan/normalize.js';
import {
  parse, parseDdgHtml, parseGoogleJson, parseResultTitle, canonicalLinkedInUrl, buildQueries, MAX_QUERIES,
} from '../../src/core/scan/providers/websearch.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ddg = fs.readFileSync(path.join(dir, '../fixtures/websearch/ddg.html'), 'utf-8');

describe('websearch provider', () => {
  test('canonicalizes LinkedIn job URLs, rejects others', () => {
    expect(canonicalLinkedInUrl('https://in.linkedin.com/jobs/view/senior-devops-at-acme-3812345678?trk=x'))
      .toBe('https://www.linkedin.com/jobs/view/3812345678');
    expect(canonicalLinkedInUrl('https://www.linkedin.com/jobs/view/3812345678/')).toBe('https://www.linkedin.com/jobs/view/3812345678');
    expect(canonicalLinkedInUrl('https://www.linkedin.com/company/acme')).toBeNull();
    expect(canonicalLinkedInUrl('https://evil.com/jobs/view/3812345678')).toBeNull();
  });

  test('parses result titles', () => {
    expect(parseResultTitle('Senior DevOps Engineer - Acme Corp - Pune, India | LinkedIn'))
      .toEqual({ title: 'Senior DevOps Engineer', company: 'Acme Corp', location: 'Pune, India' });
    expect(parseResultTitle('Globex hiring SRE in Remote | LinkedIn'))
      .toEqual({ title: 'SRE', company: 'Globex', location: 'Remote' });
  });

  test('DDG fixture -> deduped stub jobs, shape ok, commitment never full-time by default', () => {
    const hits = parseDdgHtml(ddg);
    expect(hits.length).toBe(4);
    const jobs = parse(hits, { slug: 'linkedin-search' });
    expect(jobs.length).toBe(2); // dup + company page dropped
    for (const j of jobs) expect(Object.keys(j).sort()).toEqual([...NORMALIZED_JOB_KEYS].sort());
    const [a, b] = jobs;
    expect(a.url).toBe('https://www.linkedin.com/jobs/view/3812345678');
    expect(a.employer).toBe('Acme Corp');
    expect(a.location).toContain('Bengaluru');
    expect(a.description).toBe('Acme is hiring a DevOps Engineer to run & scale infra.');
    expect(a.employmentType).toBeNull();
    expect(a.source).toBe('linkedin-search');
    expect(b.employmentType).toBe('contract'); // explicit in title only
  });

  test('Google JSON parse', () => {
    const jobs = parse(parseGoogleJson({ items: [
      { link: 'https://www.linkedin.com/jobs/view/4000000001', title: 'SRE - Initech - India | LinkedIn', snippet: 's' },
    ] }));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].employer).toBe('Initech');
    expect(parseGoogleJson(null)).toEqual([]);
  });

  test('query builder caps volume', () => {
    expect(buildQueries(['DevOps Engineer'])).toEqual([
      'site:linkedin.com/jobs/view "DevOps Engineer" India',
      'site:linkedin.com/jobs/view "DevOps Engineer" remote',
    ]);
    expect(buildQueries(Array.from({ length: 20 }, (_, i) => `A${i}`)).length).toBe(MAX_QUERIES);
    expect(buildQueries([])).toEqual([]);
  });
});
