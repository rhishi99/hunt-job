import fs from 'fs';
import 'dotenv/config';
import { createClient } from './aiClient.js';

const client = createClient();

async function extractTextFromPdf(pdfPath) {
  // Import lib directly — pdf-parse index.js runs test files on load
  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseResumeWithClaude(resumeText) {
  const response = await client.messages.create({
    model: 'smart',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `Parse this resume and return ONLY a valid JSON object. No markdown, no explanation.

Required fields:
{"name":"","email":"","phone":"","location":"","linkedin":"","github":"","currentRole":"","yearsOfExperience":0,"summary":"","techStack":[],"skills":[],"certifications":[],"suggestedArchetypes":[],"currentSalaryLPA":null,"experience":[{"title":"","company":"","startDate":"","endDate":"","description":""}],"education":[{"degree":"","field":"","school":"","year":""}],"projects":[{"title":"","description":"","technologies":[]}]}

For suggestedArchetypes pick from: Software Engineer, Data Engineer, ML Engineer, DevOps Engineer, Frontend Engineer, Backend Engineer, Full Stack Engineer, Data Analyst, Cloud Engineer, SRE, QA Engineer

Resume:
${resumeText}`
      }
    ]
  });

  const raw = response.content[0].text.trim();
  // Strip markdown code fences if present
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(jsonText);
}

export async function parseResume(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Resume file not found: ${pdfPath}`);
  }

  const resumeText = await extractTextFromPdf(pdfPath);
  if (!resumeText || resumeText.trim().length < 100) {
    throw new Error('Could not extract meaningful text from the PDF. The file may be image-based or corrupted.');
  }

  const parsed = await parseResumeWithClaude(resumeText);
  return { parsed, rawText: resumeText };
}
