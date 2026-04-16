import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resumesDir = path.join(__dirname, '../../data/resumes');

class ResumeGenerator {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.ensureResumesDir();
  }

  ensureResumesDir() {
    if (!fs.existsSync(resumesDir)) {
      fs.mkdirSync(resumesDir, { recursive: true });
    }
  }

  async generate(jobPosting, userProfile) {
    // Extract keywords from job posting
    const keywords = await this.extractKeywords(jobPosting);

    // Generate tailored resume content
    const resumeContent = await this.generateResume(jobPosting, userProfile, keywords);

    // Convert to PDF using Playwright
    const pdfPath = await this.convertToPDF(resumeContent);

    return {
      path: pdfPath,
      keywords: keywords,
      content: resumeContent
    };
  }

  async extractKeywords(jobPosting) {
    const prompt = `From this job posting, extract the top 20 most relevant keywords and skills:

${jobPosting}

Return as a JSON array of strings.`;

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    try {
      const text = response.content[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to extract keywords:', e);
    }

    return [];
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

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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

  async convertToPDF(htmlContent) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle' });

    const timestamp = Date.now();
    const pdfPath = path.join(resumesDir, `resume_${timestamp}.pdf`);

    await page.pdf({ path: pdfPath, format: 'A4' });

    await browser.close();

    return pdfPath;
  }
}

export default ResumeGenerator;
