// B-13 guard: the CLI PDF renderer (ResumeGenerator.renderHtml) and the builder's
// ATS template (resume-builder/index.html#renderATS) are two renderers of one
// data shape (src/core/resumeData.js). They cannot share markup — the builder's
// is contenteditable — so this asserts they never DISAGREE on content: every
// fact in the data must appear in both outputs.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { defaultResumeData } from '../src/core/resumeData.js';
import ResumeGenerator from '../src/core/resumeGenerator.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'resume-builder/index.html'), 'utf-8');

function loadBuilderRenderers() {
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.indexOf('// RENDER DISPATCH');
  const ctx = vm.createContext({ document: {}, window: {}, console });
  vm.runInContext(html.slice(start, end), ctx);
  return ctx;
}

const text = s =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');

describe('resume renderer parity (B-13)', () => {
  const data = defaultResumeData();
  const builder = text(vm.runInContext('renderATS', loadBuilderRenderers())(data));
  const cli = text(new ResumeGenerator().renderHtml(data));

  const facts = [
    data.name,
    data.summary,
    ...data.experience.flatMap(e => [e.title, e.company, ...e.bullets]),
    ...data.skills,
    ...data.education.flatMap(e => [e.degree, e.institution]),
    ...data.certificates.map(c => c.name),
  ].filter(Boolean);

  it('has a non-trivial fact set to compare', () => {
    expect(facts.length).toBeGreaterThan(20);
  });

  it.each(['builder', 'cli'])('%s output contains every fact', which => {
    const out = which === 'builder' ? builder : cli;
    const flat = out.toLowerCase();
    const missing = facts.filter(f => !flat.includes(text(String(f)).toLowerCase().trim()));
    expect(missing).toEqual([]);
  });
});
