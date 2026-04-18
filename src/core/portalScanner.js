import 'dotenv/config';
import { createClient } from './aiClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_CHARS_PER_COMPANY = 3000;
const SCRAPE_CONCURRENCY = 5;
const SCRAPE_TIMEOUT_MS = 25000;

// Known search URL patterns for major career portals
function buildSearchUrl(company, archetype) {
  const q = encodeURIComponent(archetype);
  const url = company.careerPageUrl;
  if (url.includes('careers.google.com')) return `https://careers.google.com/jobs/results/?q=${q}&location=India`;
  if (url.includes('careers.microsoft.com')) return `${url}&q=${q}`;
  if (url.includes('amazon.jobs')) return `https://amazon.jobs/en/search?base_query=${q}&loc_query=India`;
  if (url.includes('linkedin.com')) return `${url}?keywords=${q}&location=India`;
  return url;
}

class PortalScanner {
  constructor() {
    this.client = createClient();
    const portalsPath = path.join(__dirname, '../../config/company-portals.json');
    const portalsData = JSON.parse(fs.readFileSync(portalsPath, 'utf-8'));
    this.companies = portalsData.companies;
  }

  async scan(archetype, specificCompanies = null) {
    const companies = specificCompanies
      ? this.companies.filter(c =>
          specificCompanies.some(s => c.name.toLowerCase().includes(s.toLowerCase()))
        )
      : this.companies;

    process.stdout.write(`  Scraping ${companies.length} career pages...\n`);

    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });

    let scraped = [];
    try {
      // Scrape in parallel batches
      for (let i = 0; i < companies.length; i += SCRAPE_CONCURRENCY) {
        const batch = companies.slice(i, i + SCRAPE_CONCURRENCY);
        const results = await Promise.all(
          batch.map(c => this._scrape(browser, c, archetype))
        );
        scraped.push(...results.filter(r => r.text.length > 100));
        process.stdout.write(`  Scraped ${Math.min(i + SCRAPE_CONCURRENCY, companies.length)}/${companies.length}\n`);
      }
    } finally {
      await browser.close();
    }

    if (!scraped.length) return [];

    // ONE batched AI call for everything
    return this._extractJobs(scraped, archetype);
  }

  async _scrape(browser, company, archetype) {
    const url = buildSearchUrl(company, archetype);
    try {
      const page = await browser.newPage();
      await page.goto(url, { timeout: SCRAPE_TIMEOUT_MS, waitUntil: 'networkidle' });
      const text = await page.innerText('body');
      await page.close();
      return {
        name: company.name,
        location: company.officeLocation || 'India',
        url,
        // Preserve newlines for keyword matching; collapse horizontal whitespace only
      text: text.replace(/[^\S\n]+/g, ' ').slice(0, MAX_CHARS_PER_COMPANY),
      };
    } catch {
      return { name: company.name, location: company.officeLocation || 'India', url, text: '' };
    }
  }

  async _extractJobs(scrapedPages, archetype) {
    const pagesSummary = scrapedPages
      .map(p => `=== ${p.name} (${p.location}) — ${p.url} ===\n${p.text}`)
      .join('\n\n');

    const prompt = `You are scanning career pages for "${archetype}" job openings in India.

Below is scraped text from multiple company career pages. For each page, extract any open job listings that match the archetype "${archetype}".

${pagesSummary}

Return ONLY a valid JSON array. Each item:
{
  "title": "exact job title found on page",
  "company": "company name",
  "location": "office location",
  "url": "job posting URL or career page URL",
  "description": "1-sentence role summary"
}

Rules:
- Only include jobs actually visible in the scraped text above
- Skip companies where no matching jobs appear
- Return [] if nothing matches
- No markdown, no explanation, just the JSON array`;

    try {
      const response = await this.client.messages.create({
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      return this._parseJobs(response.content[0].text);
    } catch (e) {
      const isQuotaExhausted = e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuotaExhausted) {
        console.log('  AI quota exhausted — falling back to keyword matching.');
        return this._keywordExtract(scrapedPages, archetype);
      }
      throw new Error(`AI extraction failed: ${e.message}`);
    }
  }

  _keywordExtract(scrapedPages, archetype) {
    // Build keywords from archetype (e.g. "DevOps Engineer" → ["devops", "engineer", "sre", "platform"])
    const archetypeWords = archetype.toLowerCase().split(/\s+/);
    const synonyms = {
      devops: ['devops', 'sre', 'site reliability', 'platform engineer', 'infrastructure'],
      engineer: ['engineer', 'developer', 'dev'],
      data: ['data', 'analytics', 'bi'],
      backend: ['backend', 'back-end', 'server-side'],
      frontend: ['frontend', 'front-end', 'ui engineer'],
      fullstack: ['fullstack', 'full-stack', 'full stack'],
    };

    const keywords = new Set(archetypeWords);
    archetypeWords.forEach(w => (synonyms[w] || []).forEach(s => keywords.add(s)));

    const jobs = [];
    for (const page of scrapedPages) {
      const lines = page.text.split(/[\n.;|·•]/);
      for (const line of lines) {
        const lower = line.toLowerCase();
        const matched = [...keywords].some(k => lower.includes(k));
        if (!matched) continue;

        // Line must look like a job title (2-8 words, no full sentences)
        const trimmed = line.trim();
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount < 2 || wordCount > 10) continue;
        if (trimmed.length < 8 || trimmed.length > 80) continue;

        jobs.push({
          title: trimmed,
          company: page.name,
          location: page.location,
          url: page.url,
          description: `${page.name} is hiring for this role in ${page.location}.`,
        });
        if (jobs.filter(j => j.company === page.name).length >= 5) break; // max 5 per company
      }
    }
    return jobs;
  }

  _parseJobs(responseText) {
    if (!responseText) return [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {
      const objects = [...responseText.matchAll(/\{[\s\S]*?\}/g)];
      const jobs = [];
      for (const match of objects) {
        try { jobs.push(JSON.parse(match[0])); } catch {}
      }
      return jobs;
    }
    return [];
  }

  getCompanies(filter = null) {
    if (!filter) return this.companies;
    return this.companies.filter(c =>
      c.name.toLowerCase().includes(filter.toLowerCase())
    );
  }
}

export default PortalScanner;
