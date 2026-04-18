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
    const resumeContent = await this.generateResume(jobPosting, userProfile, keywords);
    const pdfPath = await this.convertToPDF(resumeContent, this.makeJobDir(jobPosting));

    log.op('resume_done', { path: pdfPath, keywords: keywords.length });
    return {
      path: pdfPath,
      keywords: keywords,
      content: resumeContent
    };
  }

  async extractKeywords(jobPosting) {
    const prompt = `From this job posting, extract the top 20 most relevant keywords and skills:

${jobPosting}

Return ONLY a JSON array of strings with no markdown, no explanation. Example: ["Python","AWS","Docker"]`;

    const response = await getActiveClient('light').messages.create({
            max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
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

  async generateResume(jobPosting, userProfile, keywords) {
    const prompt = `Generate a tailored resume for this job posting:

${jobPosting}

User Profile:
${JSON.stringify(userProfile, null, 2)}

Key Skills to Highlight: ${keywords.join(', ')}

Create an ATS-optimized HTML resume that:
1. Reorders experience bullets to highlight relevant skills
2. Incorporates the key skills naturally
3. Maintains a clean, professional format
4. Is easy to scan for ATS systems
5. Highlights metrics and quantifiable achievements

Return the HTML code for the resume.`;

    const response = await getActiveClient('heavy').messages.create({
            max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return response.content[0].text;
  }

  async convertToPDF(htmlContent, destDir) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle' });

    const pdfPath = path.join(destDir, `resume_${Date.now()}.pdf`);

    await page.pdf({ path: pdfPath, format: 'A4' });

    await browser.close();

    return pdfPath;
  }
}

export default ResumeGenerator;
