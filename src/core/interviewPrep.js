import 'dotenv/config';
import { getActiveClient } from './aiClient.js';
import { createLogger } from './logger.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('interviewPrep');

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

function toStr(val) {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    return val.name || val.title || val.area || val.question || val.mistake || val.description || val.text || val.task || val.focus || JSON.stringify(val);
  }
  return String(val);
}

class InterviewPrep {
  constructor() {
    this.client = getActiveClient('heavy');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }

  makeJobDir(jobDescription) {
    const slug = makeJobSlug(jobDescription);
    const dir = path.join(dataDir, slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async generatePrepPlan(jobDescription, profile) {
    log.op('prep_start', { input: jobDescription.slice(0, 100) });
    const prompt = this.buildPrepPrompt(jobDescription, profile);

    const response = await this.client.messages.create({
            max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const prepPlan = this.parsePrepResponse(response.content[0].text);
    await this.savePrepPlan(jobDescription, prepPlan);
    log.op('prep_done', { focusAreas: (prepPlan.focusAreas || []).length });

    // Enhance with YouTube links
    const enhancedPlan = await this.enrichWithYouTubeLinks(prepPlan);

    return enhancedPlan;
  }

  buildPrepPrompt(jobDescription, profile) {
    return `Based on the following job information (which may be a full description, a short snippet, or a job title + company), create a comprehensive interview preparation guide. Infer the role and tech stack from whatever context is available.

JOB INFORMATION:
${jobDescription}

CANDIDATE PROFILE:
- Current Role: ${profile.currentRole}
- Years of Experience: ${profile.yearsOfExperience}
- Tech Stack: ${profile.techStack?.join(', ')}

Please provide a structured JSON response with:

1. "techStack": Array of technologies/languages they'll ask about with difficulty level (beginner/intermediate/advanced)
2. "conceptsToMaster": Array of technical concepts organized by category (DSA, System Design, Database, etc.)
3. "focusAreas": Array of 5-8 critical areas to prepare for this specific role
4. "systemDesign": Array of system design topics likely to appear
5. "behavioralQuestions": Array of 10+ behavioral questions tailored to the role
6. "companySpecific": Insights about the company and what they value
7. "practiceResources": For each major topic, suggest the type of resource needed (e.g., "DSA Problems - LeetCode Medium", "System Design - Case Studies")
8. "interviewRounds": What to expect in each round (phone screen, coding, system design, HR, etc.)
9. "weeklyPlan": A 4-week preparation schedule with daily focus areas
10. "redFlags": Common mistakes candidates make in this interview

Format as valid JSON only.`;
  }

  parsePrepResponse(responseText) {
    try {
      // Strip markdown code fences if present (```json ... ```)
      const stripped = responseText.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse prep response as JSON:', e.message);
    }

    return {
      techStack: [],
      conceptsToMaster: [],
      focusAreas: [],
      systemDesign: [],
      behavioralQuestions: [],
      companySpecific: {},
      practiceResources: [],
      interviewRounds: [],
      weeklyPlan: {},
      redFlags: []
    };
  }

  async enrichWithYouTubeLinks(prepPlan) {
    const enriched = { ...prepPlan };
    enriched.youtubeResources = {};

    // Add curated YouTube resources for common topics
    const topicToChannels = {
      'DSA': ['Abdul Bari', 'Kunal Kushwaha', 'CodeHelp - by Babbar'],
      'System Design': ['Gaurav Sen', 'Tech Dummies Narendra L', 'InfoQ'],
      'OOP': ['Kunal Kushwaha', 'Programming with Mosh'],
      'Database': ['Hussein Nasser', 'Scaler Academy'],
      'Microservices': ['Gaurav Sen', 'Sanket Mhatre'],
      'Cloud': ['CloudAcademy', 'Acloudguru'],
      'DevOps': ['TechWorld with Nana', 'Linux Academy'],
      'Java': ['Kunal Kushwaha', 'Code With Durgesh'],
      'Python': ['Corey Schafer', 'Tech With Tim'],
      'JavaScript': ['Traversy Media', 'Web Dev Simplified'],
      'React': ['The Net Ninja', 'Scrimba'],
      'Node.js': ['Traversy Media', 'Academind'],
      'SQL': ['Alex The Analyst', 'Code With Steph'],
      'APIs': ['Dave Gray', 'The Coding Train'],
      'Docker': ['TechWorld with Nana', 'PlayWithDocker'],
      'Kubernetes': ['TechWorld with Nana', 'Edureka'],
      'AWS': ['Andrew Brown ExamPro', 'Acloudguru'],
      'GCP': ['Google Cloud Tech', 'Cloudinary'],
      'OOPS': ['Kunal Kushwaha', 'Programming with Mosh'],
      'Behavioral': ['Exponent', 'Don\'t Memorise']
    };

    const rawConcepts = enriched.conceptsToMaster;
    const conceptTopics = Array.isArray(rawConcepts)
      ? rawConcepts.flatMap(c => {
          if (typeof c === 'string') return [c];
          if (c && typeof c === 'object') {
            if (Array.isArray(c.topics)) return c.topics.map(toStr);
            return [c.name || c.category || toStr(c)];
          }
          return [String(c)];
        })
      : (rawConcepts && typeof rawConcepts === 'object') ? Object.values(rawConcepts).flat().map(toStr) : [];

    const queryTopics = [
      ...(enriched.techStack || []).map(t => typeof t === 'object' ? (t.name || t.language || toStr(t)) : t).filter(t => typeof t === 'string'),
      ...(enriched.focusAreas || []).map(toStr),
      ...conceptTopics.map(toStr)
    ];

    const uniqueTopics = [...new Set(queryTopics)];

    for (const topic of uniqueTopics.slice(0, 15)) {
      enriched.youtubeResources[topic] = this.getYouTubeLinks(topic, topicToChannels);
    }

    return enriched;
  }

  getYouTubeLinks(topic, topicToChannels) {
    const topicStr = typeof topic === 'string' ? topic : String(topic);
    const channels = topicToChannels[topicStr] || topicToChannels[Object.keys(topicToChannels).find(k => topicStr.toLowerCase().includes(k.toLowerCase()))] || [];

    if (channels.length === 0) {
      return {
        theory: `https://www.youtube.com/results?search_query=${encodeURIComponent(topicStr + ' tutorial')}`,
        practice: `https://www.youtube.com/results?search_query=${encodeURIComponent(topicStr + ' problems solutions')}`,
        channels: []
      };
    }

    return {
      theory: `https://www.youtube.com/results?search_query=${encodeURIComponent(topicStr + ' tutorial')}`,
      practice: `https://www.youtube.com/results?search_query=${encodeURIComponent(topicStr + ' interview questions')}`,
      channels: channels.map(ch => ({
        name: ch,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(ch + ' ' + topic)}`
      }))
    };
  }

  async savePrepPlan(jobDescription, prepPlan) {
    const dir = this.makeJobDir(jobDescription);
    const filename = `prep_${Date.now()}.json`;
    const filepath = path.join(dir, filename);

    const fullPlan = {
      generatedAt: new Date().toISOString(),
      jobDescription: jobDescription,
      ...prepPlan
    };

    fs.writeFileSync(filepath, JSON.stringify(fullPlan, null, 2), 'utf-8');
    return filepath;
  }

  formatPrepPlanText(plan) {
    let output = '';

    if (plan.focusAreas) {
      output += '📍 KEY FOCUS AREAS:\n';
      plan.focusAreas.forEach((area, i) => {
        output += `${i + 1}. ${toStr(area)}\n`;
      });
      output += '\n';
    }

    if (plan.conceptsToMaster) {
      output += '📚 CONCEPTS TO MASTER:\n';
      const raw = plan.conceptsToMaster;
      const categories = {};
      if (Array.isArray(raw)) {
        raw.forEach(concept => {
          if (typeof concept === 'string') {
            if (!categories['General']) categories['General'] = [];
            categories['General'].push(concept);
          } else if (concept && typeof concept === 'object') {
            const category = concept.category || 'General';
            if (!categories[category]) categories[category] = [];
            if (Array.isArray(concept.topics)) {
              categories[category].push(...concept.topics.map(toStr));
            } else {
              categories[category].push(toStr(concept));
            }
          }
        });
      } else if (raw && typeof raw === 'object') {
        Object.entries(raw).forEach(([cat, items]) => {
          categories[cat] = Array.isArray(items) ? items.map(toStr) : [toStr(items)];
        });
      }
      Object.entries(categories).forEach(([cat, items]) => {
        output += `\n${cat}:\n`;
        items.forEach(item => output += `  • ${toStr(item)}\n`);
      });
      output += '\n';
    }

    if (plan.interviewRounds) {
      output += '🎯 INTERVIEW ROUNDS:\n';
      plan.interviewRounds.forEach((round, i) => {
        const name = typeof round === 'string' ? round : (round.name || round.type || round.title || toStr(round));
        const duration = typeof round === 'object' ? (round.duration || 'N/A') : 'N/A';
        output += `${i + 1}. ${name} (${duration})\n`;
        if (round.focus) output += `   Focus: ${toStr(round.focus)}\n`;
        if (round.description) output += `   ${toStr(round.description)}\n`;
      });
      output += '\n';
    }

    if (plan.weeklyPlan) {
      output += '📅 4-WEEK PREPARATION SCHEDULE:\n';
      Object.entries(plan.weeklyPlan).forEach(([week, items]) => {
        output += `\n${week}:\n`;
        if (Array.isArray(items)) {
          items.forEach(item => output += `  • ${toStr(item)}\n`);
        } else if (items && typeof items === 'object') {
          Object.entries(items).forEach(([day, task]) => output += `  ${day}: ${toStr(task)}\n`);
        } else {
          output += `  ${items}\n`;
        }
      });
      output += '\n';
    }

    if (plan.behavioralQuestions) {
      output += '💬 KEY BEHAVIORAL QUESTIONS:\n';
      plan.behavioralQuestions.slice(0, 8).forEach((q, i) => {
        output += `${i + 1}. ${toStr(q)}\n`;
      });
      output += '\n';
    }

    if (plan.redFlags) {
      output += '⚠️ COMMON MISTAKES TO AVOID:\n';
      plan.redFlags.forEach((flag, i) => {
        output += `${i + 1}. ${toStr(flag)}\n`;
      });
      output += '\n';
    }

    return output;
  }

  formatYouTubeLinks(plan) {
    if (!plan.youtubeResources) return '';

    let output = '\n📺 YOUTUBE LEARNING RESOURCES:\n\n';

    Object.entries(plan.youtubeResources).forEach(([topic, resources]) => {
      output += `📌 ${topic}:\n`;
      output += `   Theory: ${resources.theory}\n`;
      output += `   Practice: ${resources.practice}\n`;

      if (resources.channels && resources.channels.length > 0) {
        output += '   Recommended Channels:\n';
        resources.channels.forEach(ch => {
          output += `     • ${ch.name}: ${ch.url}\n`;
        });
      }
      output += '\n';
    });

    return output;
  }
}

export default InterviewPrep;
