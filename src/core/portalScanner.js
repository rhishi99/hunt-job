import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class PortalScanner {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const portalsPath = path.join(__dirname, '../../config/company-portals.json');
    const portalsData = JSON.parse(fs.readFileSync(portalsPath, 'utf-8'));
    this.companies = portalsData.companies;
  }

  async scan(archetype, specificCompanies = null) {
    const companies = specificCompanies
      ? this.companies.filter(c => specificCompanies.includes(c.name.toLowerCase()))
      : this.companies;

    const scanPrompt = this.buildScanPrompt(archetype, companies);

    const response = await this.client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: scanPrompt,
        },
      ],
    });

    return this.parseJobsFromResponse(response.content[0].text, companies);
  }

  buildScanPrompt(archetype, companies) {
    const companyList = companies.map(c => `- ${c.name}: ${c.careerPageUrl}`).join('\n');

    return `Search for jobs matching the "${archetype}" archetype at these companies:

${companyList}

Look for open positions and return a list of matching jobs with:
- Job Title
- Company
- URL
- Brief Description
- Key Requirements

Focus on roles that would be suitable for a "${archetype}".

Return results as JSON array.`;
  }

  parseJobsFromResponse(responseText, companies) {
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse jobs from response:', e);
    }

    return [];
  }

  getCompanies(filter = null) {
    if (!filter) {
      return this.companies;
    }

    return this.companies.filter(c =>
      c.name.toLowerCase().includes(filter.toLowerCase())
    );
  }
}

export default PortalScanner;
