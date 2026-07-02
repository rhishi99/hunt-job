import { describe, test, expect } from 'vitest';
import { cleanHtml, isIndiaLocation, jobMatchesArchetype, daysAgoLabel, makeJobId, normalizeJob, NORMALIZED_JOB_KEYS } from '../../src/core/scan/normalize.js';

describe('cleanHtml', () => {
  test('strips literal HTML tags (Lever/Ashby/Recruitee style)', () => {
    expect(cleanHtml('<div><b>About Us</b></div><p>We build things.</p>')).toBe('About Us We build things.');
  });

  test('decodes single-layer entity-encoded HTML before stripping tags (Greenhouse style)', () => {
    const input = '&lt;div class=&quot;intro&quot;&gt;&lt;p&gt;GitLab is great&lt;/p&gt;&lt;/div&gt;';
    expect(cleanHtml(input)).toBe('GitLab is great');
  });

  test('converts <li> into a leading dash', () => {
    expect(cleanHtml('<ul><li>One</li><li>Two</li></ul>')).toBe('- One - Two');
  });

  test('handles null/empty input', () => {
    expect(cleanHtml(null)).toBe('');
    expect(cleanHtml('')).toBe('');
  });
});

describe('isIndiaLocation', () => {
  test('accepts explicit India cities', () => {
    expect(isIndiaLocation('Bangalore, India')).toBe(true);
    expect(isIndiaLocation('Hyderabad, Telangana')).toBe(true);
  });

  test('accepts unqualified remote', () => {
    expect(isIndiaLocation('Remote')).toBe(true);
  });

  test('rejects region-locked non-India remotes', () => {
    expect(isIndiaLocation('Remote, United States')).toBe(false);
    expect(isIndiaLocation('EMEA')).toBe(false);
  });

  test('defaults empty location to true', () => {
    expect(isIndiaLocation('')).toBe(true);
    expect(isIndiaLocation(null)).toBe(true);
  });
});

describe('jobMatchesArchetype', () => {
  test('matches on full phrase', () => {
    expect(jobMatchesArchetype('Senior Backend Engineer', null, 'Backend Engineer')).toBe(true);
  });

  test('matches via role synonyms', () => {
    expect(jobMatchesArchetype('Site Reliability Engineer II', null, 'SRE')).toBe(true);
  });

  test('does not match unrelated roles', () => {
    expect(jobMatchesArchetype('Account Executive - Italy', 'Sales', 'Data Engineer')).toBe(false);
  });
});

describe('daysAgoLabel', () => {
  test('returns null for falsy input', () => {
    expect(daysAgoLabel(null)).toBeNull();
    expect(daysAgoLabel(0)).toBeNull();
  });

  test('labels today/yesterday/N days ago', () => {
    expect(daysAgoLabel(Date.now())).toBe('today');
    expect(daysAgoLabel(Date.now() - 86400000)).toBe('1d ago');
    expect(daysAgoLabel(Date.now() - 5 * 86400000)).toBe('5d ago');
  });
});

describe('makeJobId / normalizeJob', () => {
  test('builds the {platform}:{companyToken}:{externalId} id format', () => {
    expect(makeJobId('lever', 'paytm', 'abc-123')).toBe('lever:paytm:abc-123');
  });

  test('normalizeJob output matches the NormalizedJob key contract', () => {
    const job = normalizeJob({
      platform: 'lever', companyToken: 'paytm', externalId: 'abc',
      company: 'Paytm', title: 'SDE II', location: 'Noida',
      url: 'https://x', applyUrl: 'https://x/apply', description: 'desc', postedAt: 123,
    });
    expect(Object.keys(job).sort()).toEqual([...NORMALIZED_JOB_KEYS].sort());
    expect(job.id).toBe('lever:paytm:abc');
  });

  test('falls back applyUrl to url, and postedAt to null when not finite', () => {
    const job = normalizeJob({ platform: 'x', companyToken: 'y', externalId: 'z', company: 'C', title: 'T', url: 'https://u' });
    expect(job.applyUrl).toBe('https://u');
    expect(job.postedAt).toBeNull();
  });
});
