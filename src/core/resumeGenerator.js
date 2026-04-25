import 'dotenv/config';
import { getActiveClient } from './aiClient.js';
import { createLogger } from './logger.js';
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
    const keywords = await this.extractKeywords(jobPosting);
    const resumeData = await this.generateResumeData(jobPosting, userProfile, keywords);
    const htmlContent = this.renderHtml(resumeData, userProfile);
    const destDir = this.makeJobDir(jobPosting);
    const pdfPath = await this.convertToPDF(htmlContent, destDir);

    log.op('resume_done', { path: pdfPath, keywords: keywords.length });
    return { path: pdfPath, keywords, content: htmlContent };
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

  async generateResumeData(jobPosting, userProfile, keywords) {
    const expList = (userProfile.experience || []).map(e =>
      `${e.title} at ${e.company} (${e.startDate}–${e.endDate}): ${e.description}`
    ).join('\n');

    const prompt = `Analyze this job posting and create tailored resume content for the candidate.

JOB POSTING:
${jobPosting}

CANDIDATE:
Name: ${userProfile.name}
Current Role: ${userProfile.currentRole}
Years of Experience: ${userProfile.yearsOfExperience}
Summary: ${userProfile.summary || ''}
Tech Stack: ${(userProfile.techStack || []).join(', ')}
Skills: ${(userProfile.skills || []).join(', ')}
Certifications: ${(userProfile.certifications || []).join(', ')}

EXPERIENCE:
${expList}

TOP KEYWORDS TO HIGHLIGHT: ${keywords.join(', ')}

Return ONLY a valid JSON object (no markdown, no code fences) with this structure:
{
  "summary": "2-3 sentence tailored professional summary for this specific job",
  "skills": ["skill1", "skill2"],
  "experience": [
    {
      "title": "job title",
      "company": "company name",
      "dates": "MM/YYYY – Present",
      "bullets": ["quantified achievement or responsibility"]
    }
  ]
}

Rules:
- skills: 12-16 items, prioritize JD keywords from the candidate's actual stack
- experience: use candidate's actual roles; 4-5 bullets each; reorder to highlight most relevant first
- bullets: start with strong action verbs; quantify impact where data exists
- summary: mention key technologies from the JD that the candidate actually has`;

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
      console.warn('Failed to parse resume data JSON:', e.message);
    }

    return this._buildFallbackData(userProfile, keywords);
  }

  _buildFallbackData(userProfile, keywords) {
    return {
      summary: userProfile.summary || `${userProfile.currentRole} with ${userProfile.yearsOfExperience} years of experience.`,
      skills: [...(userProfile.techStack || []), ...(userProfile.skills || [])].slice(0, 16),
      experience: (userProfile.experience || []).map(e => ({
        title: e.title,
        company: e.company,
        dates: `${e.startDate} – ${e.endDate}`,
        bullets: e.description ? e.description.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [],
      })),
    };
  }

  renderHtml(data, profile) {
    const skillTags = (data.skills || [])
      .map(s => `<span class="skill-tag">${s}</span>`).join('');

    const experienceHtml = (data.experience || []).map(job => `
      <div class="job">
        <div class="job-header">
          <div class="job-left">
            <span class="job-title">${job.title}</span>
            <span class="job-sep"> · </span>
            <span class="job-company">${job.company}</span>
          </div>
          <div class="job-dates">${job.dates}</div>
        </div>
        <ul class="job-bullets">
          ${(job.bullets || []).map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>`).join('');

    const educationHtml = (profile.education || []).map(edu => `
      <div class="edu-item">
        <div class="edu-left">
          <span class="edu-degree">${edu.degree}${edu.field ? ' in ' + edu.field : ''}</span>
          <span class="edu-school"> · ${edu.school}</span>
        </div>
        <div class="edu-year">${edu.year || ''}</div>
      </div>`).join('');

    const certHtml = (profile.certifications || []).length
      ? `<div class="section">
          <div class="section-title">Certifications</div>
          <div class="cert-list">${(profile.certifications || []).map(c =>
            `<span class="cert-tag">${c}</span>`).join('')}</div>
        </div>`
      : '';

    const linkedinHtml = profile.linkedin
      ? `<span>${profile.linkedin}</span>` : '';
    const githubHtml = profile.github
      ? `<span>${profile.github}</span>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${profile.name} — Resume</title>
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
    padding: 32px 36px;
  }

  /* ── Header ─────────────────────────────────────────── */
  .header {
    border-bottom: 3px solid #16213e;
    padding-bottom: 12px;
    margin-bottom: 16px;
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
  .section { margin-bottom: 14px; }
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
  .job { margin-bottom: 11px; }
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
    margin-top: 4px;
    padding-left: 16px;
  }
  .job-bullets li {
    font-size: 9pt;
    color: #2d3748;
    margin-bottom: 3px;
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
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="name">${profile.name}</div>
    <div class="role-line">${profile.currentRole} &nbsp;·&nbsp; ${profile.yearsOfExperience}+ Years Experience</div>
    <div class="contact">
      <span>${profile.email}</span>
      <span>${profile.phone}</span>
      <span>${profile.location || ''}</span>
      ${linkedinHtml}
      ${githubHtml}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Professional Summary</div>
    <div class="summary">${data.summary}</div>
  </div>

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

</div>
</body>
</html>`;
  }

  async convertToPDF(htmlContent, destDir) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    const pdfPath = path.join(destDir, `resume_${Date.now()}.pdf`);
    await page.pdf({ path: pdfPath, format: 'A4', margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    await browser.close();
    return pdfPath;
  }
}

export default ResumeGenerator;

export {
  makeJobSlug,
  ResumeGenerator
};
