import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '../src/core/db.js';
import {
  assertJobText, resolveJobInput, recordDocument, findJobDocument, verifyResumeText,
} from '../src/core/jobDocs.js';
import { findJobResumePdf } from '../src/core/autoFill/profileMapper.js';
import { auditRequiredFields } from '../src/core/autoFill/index.js';
import ResumeGenerator from '../src/core/resumeGenerator.js';
import InterviewPrep from '../src/core/interviewPrep.js';

const JD = 'Position: DevOps Engineer\nCompany: Acme\n\n' + 'Own CI/CD, Kubernetes and AWS infrastructure for our platform. '.repeat(3);
const URL_ = 'https://boards.greenhouse.io/acme/jobs/123';

let db;
let tmp;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobdocs-'));
  db.prepare(
    `INSERT INTO jobs (id, company_id, ats_platform, title, url, apply_url, description, canonical_url, status)
     VALUES ('j1', 'manual', 'manual', 'DevOps Engineer', ?, ?, ?, ?, 'active')`
  ).run(URL_, URL_, JD, URL_);
});
afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('B-02 resolveJobInput / assertJobText', () => {
  test('rejects a bare URL and too-short text', () => {
    expect(() => assertJobText(URL_)).toThrow(/Paste the full job description/);
    expect(() => assertJobText('short')).toThrow();
  });

  test('pasted JD text passes through', async () => {
    const r = await resolveJobInput(JD);
    expect(r.jobText).toContain('Kubernetes');
    expect(r.jobId).toBeNull();
  });

  test('URL already in jobs table resolves from DB with no network call', async () => {
    const resolver = () => { throw new Error('network must not be used'); };
    const r = await resolveJobInput(URL_, { db, resolver });
    expect(r.jobId).toBe('j1');
    expect(r.jobText).toContain('Position: DevOps Engineer');
  });

  test('unknown URL uses the resolver; unresolvable URL errors instead of passing the link on', async () => {
    const ok = await resolveJobInput('https://example.com/x', { db, resolver: async () => ({ jobText: JD }) });
    expect(ok.jobText).toContain('CI/CD');
    await expect(
      resolveJobInput('https://example.com/x', { db, resolver: async () => { throw new Error('HTTP 404'); } })
    ).rejects.toThrow(/404/);
    await expect(
      resolveJobInput('https://example.com/x', { db, resolver: async () => ({ jobText: 'https://example.com/x' }) })
    ).rejects.toThrow(/Could not resolve/);
  });

  test('generators refuse a bare URL before any AI call', async () => {
    await expect(new ResumeGenerator().generate(URL_, {})).rejects.toThrow(/Could not resolve/);
    await expect(new InterviewPrep().generatePrepPlan(URL_, {})).rejects.toThrow(/Could not resolve/);
  });
});

describe('B-03 documents table', () => {
  test('recordDocument + findJobDocument return the job\'s own newest existing file', () => {
    const a = path.join(tmp, 'a.pdf');
    const b = path.join(tmp, 'b.pdf');
    fs.writeFileSync(a, 'x'); fs.writeFileSync(b, 'y');
    recordDocument(db, { jobId: 'j1', type: 'resume', filePath: a });
    recordDocument(db, { jobId: 'j1', type: 'resume', filePath: b, verification: { ok: true } });
    recordDocument(db, { jobId: 'other', type: 'resume', filePath: path.join(tmp, 'other.pdf') });
    expect(findJobDocument(db, { jobId: 'j1' }).path).toBe(b);
    expect(findJobDocument(db, { url: URL_ }).path).toBe(b); // resolved via url
    expect(db.prepare('SELECT verification FROM documents WHERE file_path = ?').get(b).verification).toBe('{"ok":true}');
  });

  test('skips rows whose file is gone; no doc -> null, never "newest file"', () => {
    recordDocument(db, { jobId: 'j1', type: 'resume', filePath: path.join(tmp, 'gone.pdf') });
    fs.writeFileSync(path.join(tmp, 'someone-elses.pdf'), 'z');
    expect(findJobDocument(db, { jobId: 'j1' })).toBeNull();
    expect(findJobResumePdf({ jobId: 'j1', db })).toBeNull();
    expect(findJobResumePdf({ jobId: null, url: null, db })).toBeNull();
  });

  test('type filter separates resume from interview_prep', () => {
    const p = path.join(tmp, 'p.html');
    fs.writeFileSync(p, '<html/>');
    recordDocument(db, { jobId: 'j1', type: 'interview_prep', filePath: p });
    expect(findJobDocument(db, { jobId: 'j1', type: 'resume' })).toBeNull();
    expect(findJobDocument(db, { jobId: 'j1', type: 'interview_prep' }).path).toBe(p);
  });
});

describe('B-12 verifyResumeText', () => {
  const body = 'Jane Doe jane@x.com +91 80878 21219 ' + 'Kubernetes AWS Terraform Docker experience. '.repeat(15);
  test('passes on healthy text', () => {
    const v = verifyResumeText(body, {
      email: 'jane@x.com', phone: '8087821219', skills: ['AWS', 'Docker'], keywords: ['aws', 'docker', 'Rust'],
    });
    expect(v.ok).toBe(true);
    expect(v.coverage).toBe(1); // Rust is not a candidate skill -> not expected
  });
  test('flags empty text, missing contact, low keyword coverage', () => {
    const v = verifyResumeText('tiny', { email: 'jane@x.com', phone: '8087821219' });
    expect(v.ok).toBe(false);
    expect(v.issues.join(' ')).toMatch(/too short/);
    expect(v.issues.join(' ')).toMatch(/email/);
    expect(v.issues.join(' ')).toMatch(/phone/);
    const c = verifyResumeText(body, { skills: ['Go', 'Rust'], keywords: ['Go', 'Rust'] });
    expect(c.ok).toBe(false);
    expect(c.coverage).toBe(0);
  });
});

describe('B-16 auditRequiredFields', () => {
  test('returns labels from the page and never throws', async () => {
    const page = { evaluate: async () => ['Email', 'Phone'] };
    expect(await auditRequiredFields(page)).toEqual(['Email', 'Phone']);
    expect(await auditRequiredFields({ evaluate: async () => { throw new Error('closed'); } })).toEqual([]);
    expect(await auditRequiredFields({ evaluate: async () => null })).toEqual([]);
  });
  test('only calls evaluate (no click / fill / submit surface used)', async () => {
    const calls = [];
    const page = new Proxy({}, { get: (_, k) => (...a) => { calls.push(k); return k === 'evaluate' ? [] : undefined; } });
    await auditRequiredFields(page);
    expect(calls).toEqual(['evaluate']);
  });
});
