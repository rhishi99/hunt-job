import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NORMALIZED_JOB_KEYS } from '../../src/core/scan/normalize.js';
import { readScanConfig, searchTerms } from '../../src/core/scan/scanConfig.js';
import { parse as parseWorkday, parsePostedOn } from '../../src/core/scan/providers/workday.js';
import { parse as parseOracle } from '../../src/core/scan/providers/oraclehcm.js';
import { parse as parseAmazon } from '../../src/core/scan/providers/amazon.js';
import { parseList, parseJob } from '../../src/core/scan/providers/successfactors.js';
import { detectFromUrl, extractConfig } from '../../src/core/scan/detect.js';
import { PROVIDERS } from '../../src/core/scan/index.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/ats');
const json = n => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), 'utf-8'));
const html = n => fs.readFileSync(path.join(dir, `${n}.html`), 'utf-8');

describe('scanConfig helpers', () => {
  test('readScanConfig tolerates string, object, junk', () => {
    expect(readScanConfig({ scan_config: '{"a":1}' })).toEqual({ a: 1 });
    expect(readScanConfig({ scan_config: { a: 2 } })).toEqual({ a: 2 });
    expect(readScanConfig({ scan_config: 'not json' })).toEqual({});
    expect(readScanConfig({})).toEqual({});
  });
  test('searchTerms prefers archetypes, then config keywords, then one empty query', () => {
    expect(searchTerms({ archetypes: ['DevOps Engineer', 'SRE'] })).toEqual(['DevOps Engineer', 'SRE']);
    expect(searchTerms({ scan_config: '{"keywords":["k"]}' })).toEqual(['k']);
    expect(searchTerms({})).toEqual(['']);
  });
  test('new providers need no slug', () => {
    for (const p of ['workday', 'oraclehcm', 'successfactors', 'amazon']) {
      expect(PROVIDERS[p].needsSlug).toBe(false);
      expect(typeof PROVIDERS[p].fetchJobs).toBe('function');
    }
  });
});

describe('workday provider', () => {
  const ref = { name: 'Acme', scan_config: '{"tenant":"acme","wd":"wd5","site":"External","prefix":"/en-US"}' };
  const list = json('workday-list').jobPostings;

  test('stubs without detail, ids/urls/postedAt', () => {
    const jobs = parseWorkday(list, ref);
    expect(jobs).toHaveLength(3);
    for (const j of jobs) expect(Object.keys(j).sort()).toEqual(expect.arrayContaining([...NORMALIZED_JOB_KEYS].sort()));
    expect(jobs[0].id).toBe('workday:acme:R-100');
    expect(jobs[0].url).toBe('https://acme.wd5.myworkdayjobs.com/en-US/External/job/India-Bangalore/DevOps-Engineer_R-100');
    expect(jobs[0].description).toBe('');
    expect(jobs[0].descriptionState).toBe('stub');
    expect(jobs[0].postedAt).toBeGreaterThan(0);
    expect(jobs[2].postedAt).toBeNull();
    expect(jobs[2].employmentType).toBeNull(); // unknown is never full-time
  });

  test('detail hydrates description, locations, commitment', () => {
    const jobs = parseWorkday(list, ref, { [list[0].externalPath]: json('workday-detail') });
    expect(jobs[0].description).toContain('Kubernetes');
    expect(jobs[0].description).not.toContain('<');
    expect(jobs[0].location).toBe('India, Bangalore; India, Pune');
    expect(jobs[0].employmentType).toBe('part-time');
    expect(jobs[0].descriptionState).toBe('full');
  });

  test('missing coordinates throws a clear error', () => {
    expect(() => parseWorkday(list, { name: 'X', scan_config: '{}' })).toThrow(/scan_config/);
  });

  test('parsePostedOn', () => {
    const now = 1_000_000_000_000;
    expect(parsePostedOn('Posted 2 Days Ago', now)).toBe(now - 2 * 86400000);
    expect(parsePostedOn('Posted Yesterday', now)).toBe(now - 86400000);
    expect(parsePostedOn('Posted 30+ Days Ago', now)).toBeNull();
    expect(parsePostedOn(undefined, now)).toBeNull();
  });
});

describe('oraclehcm provider', () => {
  test('description from *Str fields, url, date, no detail call', () => {
    const ref = { name: 'JPM', scan_config: { host: 'jpmc.fa.oraclecloud.com', site: 'CX_1001' } };
    const jobs = parseOracle(json('oraclehcm').items[0].requisitionList, ref);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].url).toBe('https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210500123');
    expect(jobs[0].description).toContain('Own CI/CD');
    expect(jobs[0].description).toContain('Kubernetes');
    expect(jobs[0].postedAt).toBe(Date.parse('2026-09-10'));
    expect(jobs[0].employmentType).toBeNull();
    expect(jobs[1].employmentType).toBe('contract'); // title heuristic only
    expect(jobs[1].postedAt).toBeNull();
  });
});

describe('amazon provider', () => {
  test('parses full description, schedule type, unknown stays null', () => {
    const jobs = parseAmazon(json('amazon').jobs, { name: 'Amazon' });
    expect(jobs[0].id).toBe('amazon:amazon:3001');
    expect(jobs[0].url).toBe('https://www.amazon.jobs/en/jobs/3001/devops-engineer-ii');
    expect(jobs[0].description).toContain('AWS');
    expect(jobs[0].description).toContain('Terraform');
    expect(jobs[0].employmentType).toBe('full-time');
    expect(jobs[0].postedAt).toBe(Date.parse('September 10, 2026'));
    expect(jobs[1].employmentType).toBeNull();
    expect(jobs[1].postedAt).toBeNull();
  });
});

describe('successfactors provider', () => {
  test('list anchors parsed regardless of attribute order', () => {
    const rows = parseList(html('successfactors-list'));
    expect(rows.map(r => r.id)).toEqual(['1234567', '7654321']);
    expect(rows[1].title).toBe('Site Reliability & Ops');
  });

  test('job page JSON-LD hydrates; missing page stays a stub row', () => {
    const rows = parseList(html('successfactors-list'));
    const ref = { name: 'Acme SF', slug: 'acmesf' };
    const full = parseJob(html('successfactors-job'), rows[0], ref, 'careers.acme.com');
    expect(full.id).toBe('successfactors:acmesf:1234567');
    expect(full.url).toBe('https://careers.acme.com/job/Bangalore-DevOps-Engineer-KA/1234567/');
    expect(full.description).toBe('Operate clusters');
    expect(full.location).toBe('Bangalore, KA, IN');
    expect(full.employmentType).toBe('full-time');
    const stub = parseJob('', rows[1], ref, 'careers.acme.com');
    expect(stub.title).toBe('Site Reliability & Ops');
    expect(stub.description).toBe('');
    expect(stub.employmentType).toBeNull();
  });
});

describe('detect rungs 2-3 for scan_config platforms', () => {
  test('workday url -> tenant/wd/site/prefix', () => {
    const r = detectFromUrl('https://acme.wd5.myworkdayjobs.com/en-US/External/job/x');
    expect(r).toMatchObject({ platform: 'workday', token: 'acme', config: { tenant: 'acme', wd: 'wd5', site: 'External', prefix: '/en-US' } });
  });
  test('workday url without locale', () => {
    expect(detectFromUrl('https://redhat.wd5.myworkdayjobs.com/jobs').config).toEqual({ tenant: 'redhat', wd: 'wd5', site: 'jobs' });
  });
  test('oracle candidate-experience url -> host/site', () => {
    const r = detectFromUrl('https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs');
    expect(r).toMatchObject({ platform: 'oraclehcm', config: { host: 'jpmc.fa.oraclecloud.com', site: 'CX_1001' } });
  });
  test('oracle regional host (us2) keeps full host', () => {
    expect(extractConfig('oraclehcm', 'x https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/').config.host)
      .toBe('eeho.fa.us2.oraclecloud.com');
  });
  test('successfactors and amazon urls', () => {
    expect(detectFromUrl('https://career5.successfactors.eu/careers?company=x')).toMatchObject({ platform: 'successfactors', config: { host: 'career5.successfactors.eu' } });
    expect(detectFromUrl('https://jobs.sap.com/search/')).toMatchObject({ platform: 'successfactors' });
    expect(detectFromUrl('https://www.amazon.jobs/en/search')).toMatchObject({ platform: 'amazon' });
  });
  test('unrelated urls unaffected', () => {
    expect(detectFromUrl('https://jobs.lever.co/spotify').platform).toBe('lever');
    expect(detectFromUrl('https://example.com/careers')).toBeNull();
  });
});
