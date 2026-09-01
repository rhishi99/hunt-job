import 'dotenv/config';
import { getActiveClient } from './aiClient.js';
import { createLogger } from './logger.js';
import { fromProfile, mergeTailored, esc } from './resumeData.js';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('resumeGenerator');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

function makeJobSlug(jobDescription) {
  const titleMatch = jobDescription.match(/^Position:\s*(.+)/m);
  const companyMatch = jobDescription.match(/^Company:\s*(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown-Role';
  const company = companyMatch ? companyMatch[1].trim() : 'Unknown-Company';
  const date = new Date().toISOString().split('T')[0];
  return `${company}_${title}_${date}`.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
}

class ResumeGenerator {
  constructor() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }

  makeJobDir(jobPosting) {
    const slug = makeJobSlug(jobPosting);
    const dir = path.join(dataDir, slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async generate(jobPosting, userProfile) {
    log.op('resume_start', { input: jobPosting.slice(0, 100) });
    const base = fromProfile(userProfile);
    const keywords = await this.extractKeywords(jobPosting);
    const tailored = await this.generateTailored(jobPosting, base, keywords);
    const resume = mergeTailored(base, tailored);
    const htmlContent = this.renderHtml(resume);
    const destDir = this.makeJobDir(jobPosting);

    // canonical JSON beside the PDF — reopens in the interactive builder
    try {
      fs.writeFileSync(path.join(destDir, 'resume.json'), JSON.stringify(resume, null, 2));
    } catch (e) {
      log.op('resume_json_write_failed', { error: e.message });
    }
    const pdfPath = await this.convertToPDF(htmlContent, destDir);

    log.op('resume_done', { path: pdfPath, keywords: keywords.length });
    return { path: pdfPath, keywords, content: htmlContent, data: resume };
  }

  async extractKeywords(jobPosting) {
    const prompt = `From this job posting, extract the top 20 most relevant keywords and skills:

${jobPosting}

Return ONLY a JSON array of strings with no markdown, no explanation. Example: ["Python","AWS","Docker"]`;

    const response = await getActiveClient('light').messages.create({
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    try {
      const text = response.content[0].text
        .replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
      const jsonArray = this._extractBalancedArray(text);
      if (jsonArray) return JSON.parse(jsonArray);
    } catch (e) {
      console.warn('Failed to extract keywords:', e.message);
    }
    return [];
  }

  _extractBalancedArray(text) {
    const start = text.indexOf('[');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
  }

  async generateTailored(jobPosting, base, keywords) {
    const expList = (base.experience || []).map((e, i) =>
      `[${i}] ${e.title} — ${e.company} (${e.period})\n` +
      (e.bullets || []).map(b => `    - ${b}`).join('\n')
    ).join('\n');

    const prompt = `Tailor this candidate's existing resume content to the job posting below.
You are editing, not writing from scratch.

JOB POSTING:
${jobPosting}

CANDIDATE (real resume — this is the source of truth):
Name: ${base.name}
Title: ${base.title}
Summary: ${base.summary || ''}
Skills: ${(base.skills || []).join(', ')}

EXPERIENCE (each job with its real bullets):
${expList}

TOP JD KEYWORDS: ${keywords.join(', ')}

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "summary": "2-3 sentence summary, rewritten to foreground the JD-relevant parts of the candidate's real background",
  "skills": ["ordered so JD-relevant skills come first — only skills already in the candidate's list"],
  "experience": [
    { "company": "exact company name from above", "bullets": ["the job's real bullets, reworded tighter"] }
  ]
}

Hard rules:
- Do NOT invent bullets, numbers, metrics, employers, dates, job titles, or tools. Every bullet must map to one the candidate already has.
- Keep each job's bullet COUNT the same as the source. Reword only.
- If a bullet has no metric in the source, leave it without one. Never add a percentage or figure.
- Write plainly, past tense, one idea per bullet. No "Spearheaded / Leveraged / Utilized / Orchestrated", no buzzword stacking.
- "skills" must be a reordering/subset of the candidate's existing skills — add nothing new.`;

    const response = await getActiveClient('heavy').messages.create({
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text
      .replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      console.warn('Failed to parse tailored resume JSON — using untailored resume:', e.message);
    }
    return {};
  }

  renderHtml(data) {
    const contact = data.contact || {};
    const contactHtml = [contact.email, contact.phone, contact.location, contact.linkedin, contact.github]
      .filter(Boolean).map(c => `<span>${esc(c)}</span>`).join('');

    const skillTags = (data.skills || [])
      .map(s => `<span class="skill-tag">${esc(s)}</span>`).join('');

    const experienceHtml = (data.experience || []).map(job => `
      <div class="job">
        <div class="job-header">
          <div class="job-left">
            <span class="job-title">${esc(job.title)}</span>
            <span class="job-sep"> · </span>
            <span class="job-company">${esc(job.company)}${job.location ? ', ' + esc(job.location) : ''}</span>
          </div>
          <div class="job-dates">${esc(job.period || job.dates || '')}</div>
        </div>
        ${job.desc ? `<div class="job-desc">${esc(job.desc)}</div>` : ''}
        <ul class="job-bullets">
          ${(job.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}
        </ul>
      </div>`).join('');

    const educationHtml = (data.education || []).map(edu => `
      <div class="edu-item">
        <div class="edu-left">
          <span class="edu-degree">${esc(edu.degree)}</span>
          <span class="edu-school"> · ${esc(edu.institution || edu.school || '')}</span>
        </div>
        <div class="edu-year">${esc(edu.period || edu.year || '')}</div>
      </div>`).join('');

    const certList = (data.certificates || []).map(c =>
      typeof c === 'string' ? c : [c.name, c.period].filter(Boolean).join(' — ')
    ).filter(Boolean);
    const certHtml = certList.length
      ? `<div class="section">
          <div class="section-title">Certifications</div>
          <div class="cert-list">${certList.map(c => `<span class="cert-tag">${esc(c)}</span>`).join('')}</div>
        </div>`
      : '';

    const langHtml = (data.languages || []).length
      ? `<div class="section">
          <div class="section-title">Languages</div>
          <div class="lang-list">${(data.languages || []).map(l =>
            `<span class="lang-item">${esc(l.name)}${l.level ? ' — ' + esc(l.level) : ''}</span>`).join('')}</div>
        </div>`
      : '';

    const interestHtml = (data.interests || []).length
      ? `<div class="section">
          <div class="section-title">Interests</div>
          <div class="cert-list">${(data.interests || []).map(t => `<span class="cert-tag">${esc(t)}</span>`).join('')}</div>
        </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.name)} — Resume</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10pt;
    color: #1a1a2e;
    line-height: 1.45;
    background: #fff;
  }
  .page {
    max-width: 780px;
    margin: 0 auto;
    padding: 24px 36px;
  }

  /* ── Header ─────────────────────────────────────────── */
  .header {
    border-bottom: 3px solid #16213e;
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .name {
    font-size: 26pt;
    font-weight: 700;
    color: #16213e;
    letter-spacing: 0.5px;
    line-height: 1.1;
  }
  .role-line {
    font-size: 11pt;
    color: #0f3460;
    font-weight: 600;
    margin-top: 3px;
  }
  .contact {
    display: flex;
    flex-wrap: wrap;
    gap: 0 20px;
    margin-top: 6px;
    font-size: 8.5pt;
    color: #555;
  }
  .contact span { white-space: nowrap; }
  .contact span + span::before { content: '|'; margin-right: 20px; color: #bbb; }

  /* ── Section ─────────────────────────────────────────── */
  .section { margin-bottom: 10px; }
  .section-title {
    font-size: 8pt;
    font-weight: 700;
    color: #0f3460;
    text-transform: uppercase;
    letter-spacing: 2px;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 3px;
    margin-bottom: 8px;
  }

  /* ── Summary ─────────────────────────────────────────── */
  .summary {
    font-size: 9.5pt;
    color: #2d3748;
    line-height: 1.5;
  }

  /* ── Skills ──────────────────────────────────────────── */
  .skills-wrap { display: flex; flex-wrap: wrap; gap: 5px; }
  .skill-tag {
    background: #edf2ff;
    color: #2b4acb;
    border: 1px solid #c5d0fb;
    padding: 2px 9px;
    border-radius: 3px;
    font-size: 8.5pt;
    font-weight: 500;
  }

  /* ── Experience ──────────────────────────────────────── */
  .job { margin-bottom: 8px; }
  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .job-left { flex: 1; min-width: 0; }
  .job-title { font-weight: 700; font-size: 10pt; color: #16213e; }
  .job-sep { color: #a0aec0; }
  .job-company { font-size: 9.5pt; color: #4a5568; }
  .job-dates {
    font-size: 8.5pt;
    color: #718096;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .job-bullets {
    margin-top: 3px;
    padding-left: 16px;
  }
  .job-bullets li {
    font-size: 9pt;
    color: #2d3748;
    margin-bottom: 2px;
    line-height: 1.35;
  }

  /* ── Education ───────────────────────────────────────── */
  .edu-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 5px;
  }
  .edu-left { flex: 1; }
  .edu-degree { font-weight: 600; font-size: 9.5pt; color: #16213e; }
  .edu-school { font-size: 9pt; color: #4a5568; }
  .edu-year { font-size: 8.5pt; color: #718096; white-space: nowrap; }

  /* ── Certifications ──────────────────────────────────── */
  .cert-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .cert-tag {
    background: #f0fff4;
    color: #276749;
    border: 1px solid #9ae6b4;
    padding: 2px 9px;
    border-radius: 3px;
    font-size: 8.5pt;
    font-weight: 500;
  }
  .job-desc { font-size: 8.5pt; color: #718096; font-style: italic; margin-top: 2px; }
  .lang-list { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 9pt; color: #2d3748; }

  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .job, .edu-item, .job-bullets li { break-inside: avoid; }
    .section-title { break-after: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="name">${esc(data.name)}</div>
    ${data.title ? `<div class="role-line">${esc(data.title)}</div>` : ''}
    <div class="contact">${contactHtml}</div>
  </div>

  ${data.summary ? `<div class="section">
    <div class="section-title">Professional Summary</div>
    <div class="summary">${esc(data.summary)}</div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Technical Skills</div>
    <div class="skills-wrap">${skillTags}</div>
  </div>

  <div class="section">
    <div class="section-title">Professional Experience</div>
    ${experienceHtml}
  </div>

  ${certHtml}

  <div class="section">
    <div class="section-title">Education</div>
    ${educationHtml}
  </div>

  ${langHtml}
  ${interestHtml}

</div>
</body>
</html>`;
  }

  async convertToPDF(htmlContent, destDir) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    const pdfPath = path.join(destDir, `resume_${Date.now()}.pdf`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '9mm', bottom: '9mm', left: '0', right: '0' },
    });
    await browser.close();
    return pdfPath;
  }
}

export default ResumeGenerator;

export {
  makeJobSlug,
  ResumeGenerator
};
