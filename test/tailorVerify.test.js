import { describe, test, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '../src/core/db.js';
import { verifyTailored, renderTailorReport, checkRewrite, buildLexicon, numbersIn } from '../src/core/tailorVerify.js';
import { mergeTailored } from '../src/core/resumeData.js';
import ResumeGenerator from '../src/core/resumeGenerator.js';

const base = {
  name: 'Jane', title: 'SRE', summary: 'Site reliability engineer who ran Kubernetes clusters on AWS.',
  skills: ['Kubernetes', 'AWS', 'Docker', 'Terraform'], skillGroups: {},
  experience: [{
    title: 'SRE', company: 'Acme', period: '2020 - 2023', desc: '',
    bullets: [
      'Built CI pipelines with Jenkins that cut deploy time by 40%.',
      'Contributed to Terraform modules for AWS networking.',
      'Ran Kubernetes clusters serving 200 services.',
    ],
  }],
  certificates: [], education: [],
};
const tail = bullets => ({ experience: [{ company: 'Acme', bullets }] });
const res = (t, i = 0, j = 0) => verifyTailored(base, t).report.jobs[j].bullets[i];

describe('checkRewrite / helpers', () => {
  test('numbersIn normalises', () => {
    expect(numbersIn('cut 40 % and 2x, 1,200.')).toEqual(['40%', '2x', '1,200']);
  });
  test('passes a pure reword', () => {
    expect(checkRewrite('Made Jenkins CI pipelines that cut deploy time 40%.', base.experience[0].bullets[0], buildLexicon(base), { checkLength: false })).toBeNull();
  });
});

describe('verifyTailored bullets', () => {
  test('identical bullet is grounded', () => {
    const r = res(tail([{ source_index: 0, text: base.experience[0].bullets[0] }]));
    expect(r.result).toBe('grounded');
  });

  test('legit reword is reworded-ok and kept', () => {
    const { tailored, report } = verifyTailored(base, tail([{ source_index: 0, text: 'Built Jenkins CI pipelines that cut deploy time by 40%.' }]));
    expect(report.jobs[0].bullets[0].result).toBe('reworded-ok');
    expect(tailored.experience[0].bullets[0]).toContain('Jenkins CI pipelines');
  });

  test('new metric is ungrounded and reverted to source', () => {
    const { tailored, report } = verifyTailored(base, tail([{ source_index: 0, text: 'Built Jenkins CI pipelines that cut deploy time by 65%.' }]));
    const b = report.jobs[0].bullets[0];
    expect(b.result).toBe('ungrounded');
    expect(b.reason).toMatch(/^number:/);
    expect(tailored.experience[0].bullets[0]).toBe(base.experience[0].bullets[0]);
  });

  test('new tool/employer is ungrounded (entity)', () => {
    const r = res(tail([{ source_index: 1, text: 'Contributed to Terraform modules for AWS networking at Google.' }]), 1);
    expect(r.result).toBe('ungrounded');
    expect(r.reason).toBe('entity:Google');
  });

  test('scope inflation: contributed -> led is ungrounded', () => {
    const r = res(tail([{ source_index: 1, text: 'Led Terraform modules for AWS networking.' }]), 1);
    expect(r.result).toBe('ungrounded');
    expect(r.reason).toBe('scope:led');
  });

  test('length blow-up is ungrounded', () => {
    const r = res(tail([{ source_index: 2, text: 'Ran Kubernetes clusters serving 200 services and Docker containers on AWS with Terraform automation and more Kubernetes.' }]), 2);
    expect(r.result).toBe('ungrounded');
    expect(r.reason).toMatch(/^length:/);
  });

  test('plain-string bullets pair by position (legacy shape)', () => {
    const { report } = verifyTailored(base, tail(base.experience[0].bullets));
    expect(report.counts.grounded).toBe(3);
  });

  test('missing bullets revert to source; extra bullets dropped', () => {
    const { tailored, report } = verifyTailored(base, tail([
      { source_index: 0, text: base.experience[0].bullets[0] },
      { source_index: 1, text: base.experience[0].bullets[1] },
      { source_index: 2, text: base.experience[0].bullets[2] },
      { source_index: 3, text: 'Invented an extra bullet about Rust.' },
    ]));
    expect(tailored.experience[0].bullets).toHaveLength(3);
    expect(report.jobs[0].bullets.at(-1)).toMatchObject({ result: 'ungrounded', reason: 'extra-bullet' });

    const short = verifyTailored(base, tail([{ source_index: 0, text: base.experience[0].bullets[0] }]));
    expect(short.tailored.experience[0].bullets).toEqual(base.experience[0].bullets);
    expect(short.report.jobs[0].bullets[1].reason).toBe('missing');
  });

  test('unknown company in tailored output is ignored', () => {
    const { tailored } = verifyTailored(base, { experience: [{ company: 'Ghost', bullets: [{ text: 'x' }] }] });
    expect(tailored.experience).toHaveLength(0);
  });
});

describe('verifyTailored summary / skills / keywords', () => {
  test('ungrounded summary sentence dropped, grounded one kept', () => {
    const { tailored, report } = verifyTailored(base, {
      summary: 'Site reliability engineer who ran Kubernetes clusters on AWS. Saved $2M at Google.',
    });
    expect(report.summary.result).toBe('partial');
    expect(tailored.summary).toBe('Site reliability engineer who ran Kubernetes clusters on AWS.');
    expect(report.warnings.join()).toMatch(/summary partial/);
  });

  test('fully ungrounded summary reverts to base', () => {
    const { tailored, report } = verifyTailored(base, { summary: 'Led 500 engineers at Google.' });
    expect(report.summary.result).toBe('kept-source');
    expect(tailored.summary).toBe(base.summary);
  });

  test('invented skills reported; merge drops them', () => {
    const { tailored, report } = verifyTailored(base, { skills: ['AWS', 'Rust', 'k8s'] });
    expect(report.skills.rejected).toEqual(['Rust', 'k8s']); // k8s alias is handled by mergeTailored, still flagged here
    expect(mergeTailored(base, tailored).skills).not.toContain('Rust');
  });

  test('keyword coverage limited to candidate lexicon, density warned', () => {
    const { report } = verifyTailored(base, tail(base.experience[0].bullets), { keywords: ['AWS', 'Rust', 'Docker', 'Kubernetes'] });
    expect(report.keywords.targets).toEqual(['aws', 'docker', 'kubernetes']);
    expect(report.keywords.present).toContain('aws');
    expect(report.keywords.missing).toEqual([]);
  });
});

describe('renderTailorReport', () => {
  test('markdown has table, results and keyword section', () => {
    const { report } = verifyTailored(base, tail([{ source_index: 0, text: 'Built Jenkins CI pipelines that cut deploy time by 65%.' }]), { keywords: ['AWS'] });
    const md = renderTailorReport(report);
    expect(md).toContain('| Source | Tailored | Result |');
    expect(md).toContain('ungrounded (number:65%)');
    expect(md).toContain('## Keyword coverage');
  });
});

describe('ResumeGenerator.generate wiring', () => {
  test('writes tailor-report.md and stores verification JSON in documents (no LLM, no browser)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailor-'));
    const db = new Database(':memory:');
    runMigrations(db);
    const rg = new ResumeGenerator();
    rg.makeJobDir = () => dir;
    rg.extractKeywords = async () => ['AWS', 'Rust'];
    rg.generateTailored = async () => tail([
      { source_index: 0, text: 'Built Jenkins CI pipelines that cut deploy time by 65%.' },
      { source_index: 1, text: base.experience[0].bullets[1] },
      { source_index: 2, text: base.experience[0].bullets[2] },
    ]);
    rg.convertToPDF = async (_h, d) => { const p = path.join(d, 'r.pdf'); fs.writeFileSync(p, 'x'); return p; };
    rg.verifyPdf = async () => ({ ok: true, issues: [], length: 1, coverage: 1 });

    const profile = {
      name: 'Jane', currentRole: 'SRE', skills: base.skills,
      experience: [{ title: 'SRE', company: 'Acme', period: '2020 - 2023', bullets: base.experience[0].bullets }],
    };
    const jd = 'Position: SRE\nCompany: X\n' + 'We need an SRE who knows AWS and Kubernetes well. '.repeat(4);
    const out = await rg.generate(jd, profile, { db, jobId: null });

    expect(fs.existsSync(path.join(dir, 'tailor-report.md'))).toBe(true);
    expect(out.data.experience[0].bullets[0]).toBe(base.experience[0].bullets[0]); // reverted
    const row = db.prepare('SELECT verification FROM documents WHERE id = ?').get(out.documentId);
    const v = JSON.parse(row.verification);
    expect(v.tailor.counts.ungrounded).toBe(1);
    expect(v.ok).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
