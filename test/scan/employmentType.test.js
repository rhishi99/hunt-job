import { describe, test, expect } from 'vitest';
import {
  normalizeEmploymentType, guessEmploymentType, normalizeJob, EMPLOYMENT_TYPES,
} from '../../src/core/scan/normalize.js';
import { filterJobs } from '../../src/core/scan/query.js';
import { parse as parseRemotive } from '../../src/core/scan/providers/remotive.js';
import { parse as parseHimalayas } from '../../src/core/scan/providers/himalayas.js';

describe('normalizeEmploymentType — every provider spells it differently', () => {
  test.each([
    // provider spelling                    -> canonical
    ['Part-time', 'part-time'],             // Lever
    ['PartTime', 'part-time'],              // Ashby
    ['PART_TIME', 'part-time'],             // schema.org / JSON-LD
    ['Part Time', 'part-time'],             // Himalayas
    ['part_time', 'part-time'],             // Remotive
    ['parttime_permanent', 'part-time'],    // Recruitee
    ['Contract', 'contract'],
    ['CONTRACTOR', 'contract'],
    ['Contractor', 'contract'],             // Himalayas
    ['freelance', 'contract'],
    ['FullTime', 'full-time'],
    ['fulltime_permanent', 'full-time'],
    ['Intern', 'internship'],
    ['INTERN', 'internship'],
    ['Temporary', 'temporary'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeEmploymentType(raw)).toBe(expected);
  });

  test.each([[''], [null], [undefined], ['Elephant'], ['Hybrid']])(
    'returns null for %s rather than guessing full-time', raw => {
      expect(normalizeEmploymentType(raw)).toBeNull();
    });

  test('part-time wins over the "permanent" in parttime_permanent', () => {
    // Both patterns match this string; ordering decides, and getting it wrong
    // would silently reclassify every Recruitee part-time role as full-time.
    expect(normalizeEmploymentType('parttime_permanent')).toBe('part-time');
  });

  test('only ever emits values from EMPLOYMENT_TYPES', () => {
    for (const raw of ['Part-time', 'Contractor', 'Intern', 'Temporary', 'FullTime']) {
      expect(EMPLOYMENT_TYPES).toContain(normalizeEmploymentType(raw));
    }
  });
});

describe('guessEmploymentType — heuristic for providers with no field', () => {
  test('reads a commitment out of the title', () => {
    expect(guessEmploymentType('DevOps Engineer (Part-Time)')).toBe('part-time');
    expect(guessEmploymentType('Freelance SRE')).toBe('contract');
    expect(guessEmploymentType('DevOps Engineer Senior (Fixed-Term Contract)')).toBe('contract');
  });

  test('plain titles yield null, not an assumed full-time', () => {
    expect(guessEmploymentType('Senior DevOps Engineer')).toBeNull();
    expect(guessEmploymentType('Platform Engineer II')).toBeNull();
  });

  test('reads an explicitly labelled field out of the description', () => {
    expect(guessEmploymentType('DevOps Engineer', 'Employment type: Part-time')).toBe('part-time');
    expect(guessEmploymentType('DevOps Engineer', 'Job Type: Contract')).toBe('contract');
  });

  test('ignores boilerplate description prose', () => {
    // The reason the description is only consulted via an anchored label.
    expect(guessEmploymentType('DevOps Engineer', 'Part-time employees are eligible for benefits.')).toBeNull();
    expect(guessEmploymentType('DevOps Engineer', 'You will sign a contract of employment.')).toBeNull();
  });

  test('does not treat product codes or job titles as commitments', () => {
    // Both of these were real false positives on live data.
    expect(guessEmploymentType('Maintenance Manager_HzP/TEF3_PT')).toBeNull();
    expect(guessEmploymentType('SAP Controlling Consultant')).toBeNull();
  });
});

describe('normalizeJob wiring', () => {
  const base = {
    platform: 'lever', companyToken: 'acme', externalId: '1',
    company: 'Acme', title: 'DevOps Engineer', url: 'https://x/1',
  };

  test('prefers the provider field over the title heuristic', () => {
    const j = normalizeJob({ ...base, title: 'Freelance DevOps Engineer', employmentType: 'Full-time' });
    expect(j.employmentType).toBe('full-time');
  });

  test('falls back to the heuristic when the provider gives nothing', () => {
    expect(normalizeJob({ ...base, title: 'DevOps Engineer (Part-Time)' }).employmentType).toBe('part-time');
  });

  test('leaves employmentType null when nothing is known', () => {
    expect(normalizeJob(base).employmentType).toBeNull();
  });

  test('employer defaults to null for per-company ATS boards', () => {
    expect(normalizeJob(base).employer).toBeNull();
    expect(normalizeJob({ ...base, employer: 'Acme' }).employer).toBe('Acme');
  });
});

describe('filterJobs commitment filter', () => {
  const jobs = [
    { id: '1', title: 'DevOps Engineer', location: 'Remote', employmentType: 'full-time' },
    { id: '2', title: 'DevOps Engineer', location: 'Remote', employmentType: 'part-time' },
    { id: '3', title: 'SRE', location: 'Remote', employmentType: 'contract' },
    { id: '4', title: 'Platform Engineer', location: 'Remote', employmentType: null },
  ];

  test('single type', () => {
    expect(filterJobs(jobs, { employmentType: 'part-time' }).map(j => j.id)).toEqual(['2']);
  });

  test('list of types', () => {
    expect(filterJobs(jobs, { employmentType: ['part-time', 'contract'] }).map(j => j.id).sort())
      .toEqual(['2', '3']);
  });

  test('an unknown commitment never satisfies a filter', () => {
    // Unknown != full-time. Claiming otherwise would surface roles as gigs
    // purely because the provider stayed silent.
    expect(filterJobs(jobs, { employmentType: 'full-time' }).map(j => j.id)).toEqual(['1']);
    expect(filterJobs(jobs, { employmentType: EMPLOYMENT_TYPES }).map(j => j.id)).not.toContain('4');
  });

  test('no filter returns everything, nulls included', () => {
    expect(filterJobs(jobs, {})).toHaveLength(4);
  });
});

describe('aggregator providers put the hiring company in `employer`', () => {
  test('remotive', () => {
    const [j] = parseRemotive({
      jobs: [{
        id: 42, url: 'https://remotive.com/x', title: 'DevOps Engineer',
        company_name: 'Lemon.io', job_type: 'part_time',
        candidate_required_location: 'Worldwide', description: '<p>hi</p>',
        publication_date: '2026-08-27T14:36:09',
      }],
    });
    expect(j.employer).toBe('Lemon.io');
    expect(j.employmentType).toBe('part-time');
    expect(j.source).toBe('remotive');
    expect(j.location).toBe('Worldwide');
  });

  test('himalayas, including its unix-SECONDS pubDate', () => {
    const [j] = parseHimalayas({
      jobs: [{
        title: 'Cloud Engineer, Contract', companyName: '66degrees',
        companySlug: '66degrees', employmentType: 'Contractor',
        locationRestrictions: ['India'], description: '<p>hi</p>',
        guid: 'https://himalayas.app/x', applicationLink: 'https://himalayas.app/x/apply',
        pubDate: 1788412651,
      }],
    });
    expect(j.employer).toBe('66degrees');
    expect(j.employmentType).toBe('contract');
    expect(j.location).toBe('India');
    // Seconds, not ms — a raw pubDate would date the job to 1970.
    expect(j.postedAt).toBe(1788412651 * 1000);
  });

  test('empty locationRestrictions means worldwide remote, not missing', () => {
    const [j] = parseHimalayas({
      jobs: [{ title: 'SRE', companyName: 'X', companySlug: 'x', locationRestrictions: [], guid: 'g' }],
    });
    expect(j.location).toBe('Remote');
  });

  test('both tolerate a malformed payload without throwing', () => {
    expect(parseRemotive(null)).toEqual([]);
    expect(parseRemotive({})).toEqual([]);
    expect(parseHimalayas(null)).toEqual([]);
    expect(parseHimalayas({ jobs: 'nope' })).toEqual([]);
  });
});
