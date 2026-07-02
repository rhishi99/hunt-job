import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  evaluationRowFromJson,
  applicationRowFromJson,
  companyRowFromPortal,
  companyRowFromScannable,
} from '../scripts/migrate-to-sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleJob = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sample-evaluated-job.json'), 'utf-8'));

describe('evaluationRowFromJson', () => {
  test('maps an evaluated-jobs.json entry to an evaluations row', () => {
    const row = evaluationRowFromJson(sampleJob);
    expect(row.id).toBe('job_test_123');
    expect(row.url).toBe(sampleJob.url);
    expect(row.evaluated_at).toBe('2026-04-25T10:00:00.000Z');
    expect(JSON.parse(row.evaluation).overallScore).toBe(4.2);
    expect(JSON.parse(row.profile).archetypes).toEqual(['Software Engineer', 'Data Engineer']);
  });

  test('defaults missing evaluation/profile to empty objects', () => {
    const row = evaluationRowFromJson({ id: 'job_x', url: 'u' });
    expect(JSON.parse(row.evaluation)).toEqual({});
    expect(JSON.parse(row.profile)).toEqual({});
  });
});

describe('applicationRowFromJson', () => {
  test('maps a full applications.json entry (tracker-shaped)', () => {
    const app = {
      id: 'app_1', title: 'SDE III', company: 'InMobi', location: 'Bangalore',
      url: 'https://job-boards.greenhouse.io/inmobi/jobs/1', status: 'Applied',
      appliedAt: '2026-07-01T18:22:07.959Z', applicantName: 'Jane', applyMethod: 'autofill',
      platform: 'greenhouse', fieldsFilledCount: 12, resumeUploaded: true,
      resumePath: 'C:\\data\\resume.pdf', evaluationScore: 4, recommendation: 'Apply',
    };
    const row = applicationRowFromJson(app);
    expect(row.id).toBe('app_1');
    expect(row.applied_at).toBe(app.appliedAt);
    expect(row.applicant_name).toBe('Jane');
    expect(row.resume_uploaded).toBe(1);
    expect(row.evaluation_score).toBe(4);
  });

  test('maps a minimal legacy entry (no tracker fields) without crashing', () => {
    const app = { id: 'app_2', title: 'DevOps', company: 'Paytm', url: 'https://x', status: 'Applied', appliedAt: '2026-04-18T11:13:57.623Z', resumePath: 'r.pdf' };
    const row = applicationRowFromJson(app);
    expect(row.id).toBe('app_2');
    expect(row.applicant_name).toBeNull();
    expect(row.resume_uploaded).toBe(0);
    expect(row.resume_path).toBe('r.pdf');
  });
});

describe('company row mappers', () => {
  test('companyRowFromPortal uses careerPageUrl and officeLocation', () => {
    const row = companyRowFromPortal({ name: 'Razorpay', careerPageUrl: 'https://razorpay.com/careers/', officeLocation: 'Bangalore' });
    expect(row).toEqual({ name: 'Razorpay', slug: null, ats_platform: null, location: 'Bangalore', career_url: 'https://razorpay.com/careers/' });
  });

  test('companyRowFromScannable uses slug + api as ats_platform', () => {
    const row = companyRowFromScannable({ name: 'Paytm', slug: 'paytm', location: 'Noida / Bangalore', api: 'lever' });
    expect(row).toEqual({ name: 'Paytm', slug: 'paytm', ats_platform: 'lever', location: 'Noida / Bangalore', career_url: null });
  });
});
