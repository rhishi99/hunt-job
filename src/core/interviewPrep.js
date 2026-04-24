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
      messages: [{ role: 'user', content: prompt }],
    });

    const prepPlan = this.parsePrepResponse(response.content[0].text);
    log.op('prep_done', { focusAreas: (prepPlan.focusAreas || []).length });

    const enhancedPlan = await this.enrichWithYouTubeLinks(prepPlan);
    const filePath = await this.savePrepPlan(jobDescription, enhancedPlan);

    return { plan: enhancedPlan, filePath };
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
    const filename = `prep_${Date.now()}.html`;
    const filepath = path.join(dir, filename);
    const html = this.renderPrepHtml(prepPlan, jobDescription);
    fs.writeFileSync(filepath, html, 'utf-8');
    return filepath;
  }

  renderPrepHtml(plan, jobDescription) {
    const titleMatch = jobDescription.match(/^Position:\s*(.+)/m);
    const companyMatch = jobDescription.match(/^Company:\s*(.+)/m);
    const jobTitle = titleMatch ? titleMatch[1].trim() : 'Interview Prep';
    const company  = companyMatch ? companyMatch[1].trim() : '';
    const generatedAt = new Date().toLocaleDateString('en-IN',
      { day: 'numeric', month: 'long', year: 'numeric' });

    // ── Focus areas ──────────────────────────────────────────────────────────
    const focusAreasHtml = (plan.focusAreas || []).map((a, i) => `
      <div class="focus-item">
        <span class="focus-num">${i + 1}</span>
        <span class="focus-text">${toStr(a)}</span>
      </div>`).join('');

    // ── Tech stack ───────────────────────────────────────────────────────────
    const techStackHtml = (plan.techStack || []).map(t => {
      const name  = typeof t === 'object' ? (t.technology || t.name || t.language || toStr(t)) : t;
      const level = typeof t === 'object'
        ? (t.difficulty || t.level || 'intermediate').toLowerCase() : 'intermediate';
      const lvlLabel = level.charAt(0).toUpperCase() + level.slice(1);
      return `<div class="tech-tag ${level}"><span class="tech-name">${name}</span><span class="tech-level">${lvlLabel}</span></div>`;
    }).join('');

    // ── Concepts ─────────────────────────────────────────────────────────────
    const conceptsHtml = (() => {
      const raw = plan.conceptsToMaster || [];
      const categories = {};
      if (Array.isArray(raw)) {
        raw.forEach(c => {
          if (typeof c === 'string') {
            (categories['General'] = categories['General'] || []).push(c);
          } else if (c && typeof c === 'object') {
            const cat = c.category || 'General';
            categories[cat] = categories[cat] || [];
            if (Array.isArray(c.topics)) categories[cat].push(...c.topics.map(toStr));
            else if (Array.isArray(c.concepts)) categories[cat].push(...c.concepts.map(toStr));
            else categories[cat].push(toStr(c));
          }
        });
      } else if (raw && typeof raw === 'object') {
        Object.entries(raw).forEach(([k, v]) => {
          categories[k] = Array.isArray(v) ? v.map(toStr) : [toStr(v)];
        });
      }
      return Object.entries(categories).map(([cat, items]) => `
        <div class="concept-group">
          <div class="concept-cat">${cat}</div>
          <div class="concept-pills">${items.map(item =>
            `<span class="pill">${toStr(item)}</span>`).join('')}</div>
        </div>`).join('');
    })();

    // ── Interview rounds — FIX: AI returns r.round, not r.name ───────────────
    const roundsHtml = (plan.interviewRounds || []).map((r, i) => {
      const name   = typeof r === 'string' ? r
        : (r.round || r.name || r.type || r.title || '');
      const dur    = typeof r === 'object' ? (r.duration || '') : '';
      const topics = typeof r === 'object' && Array.isArray(r.topics) ? r.topics : [];
      const desc   = typeof r === 'object' && !topics.length
        ? (r.description || r.focus || r.details || '') : '';
      return `
        <div class="round">
          <div class="round-badge">${i + 1}</div>
          <div class="round-body">
            <div class="round-header">
              <span class="round-name">${name}</span>
              ${dur ? `<span class="round-dur">${dur}</span>` : ''}
            </div>
            ${topics.length ? `<div class="round-topics">
              ${topics.map(t => `<span class="round-topic">${t}</span>`).join('')}
            </div>` : ''}
            ${desc ? `<div class="round-desc">${toStr(desc)}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    // ── Weekly plan ──────────────────────────────────────────────────────────
    const weeklyHtml = (() => {
      const wp = plan.weeklyPlan || {};
      return Object.entries(wp).map(([week, items], wi) => {
        let body = '';
        if (Array.isArray(items)) {
          body = `<ul class="week-list">${items.map(i =>
            `<li>${toStr(i)}</li>`).join('')}</ul>`;
        } else if (items && typeof items === 'object') {
          body = Object.entries(items).map(([day, task]) =>
            `<div class="week-day"><span class="week-day-label">${day}</span><span>${toStr(task)}</span></div>`
          ).join('');
        } else {
          body = `<p class="week-text">${toStr(items)}</p>`;
        }
        return `
          <div class="week-card">
            <div class="week-header">
              <span class="week-badge">W${wi + 1}</span>
              <span class="week-title">${week}</span>
            </div>
            <div class="week-body">${body}</div>
          </div>`;
      }).join('');
    })();

    // ── Behavioral questions ─────────────────────────────────────────────────
    const behavioralHtml = (plan.behavioralQuestions || []).map((q, i) => `
      <div class="bq-item">
        <span class="bq-num">Q${i + 1}</span>
        <span class="bq-text">${toStr(q)}</span>
      </div>`).join('');

    // ── Red flags ────────────────────────────────────────────────────────────
    const flagsHtml = (plan.redFlags || []).map(f => `
      <div class="flag-item">
        <span class="flag-icon">!</span>
        <span>${toStr(f)}</span>
      </div>`).join('');

    // ── Company specific — FIX: render object fields, not JSON.stringify ──────
    const companyHtml = (() => {
      const cs = plan.companySpecific;
      if (!cs || (typeof cs === 'object' && !Object.keys(cs).length)) return '';
      if (typeof cs === 'string') return `<p class="ci-prose">${cs}</p>`;

      const LABELS = {
        companyCulture:  'Culture',
        companyValues:   'Values',
        companyProducts: 'Products',
        interviewStyle:  'Interview Style',
        teamStructure:   'Team',
        workStyle:       'Work Style',
        techCulture:     'Tech Culture',
        whatTheyValue:   'What They Value',
        missionStatement:'Mission',
        keyInsights:     'Key Insights',
      };

      return Object.entries(cs).map(([key, val]) => {
        if (!val) return '';
        const label = LABELS[key]
          || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        if (Array.isArray(val)) {
          return `
            <div class="ci-row">
              <div class="ci-label">${label}</div>
              <div class="ci-chips">${val.map(v =>
                `<span class="ci-chip">${v}</span>`).join('')}</div>
            </div>`;
        }
        return `
          <div class="ci-row">
            <div class="ci-label">${label}</div>
            <div class="ci-prose">${String(val)}</div>
          </div>`;
      }).filter(Boolean).join('');
    })();

    // ── YouTube resources ────────────────────────────────────────────────────
    const ytHtml = (() => {
      const yr = plan.youtubeResources;
      if (!yr || !Object.keys(yr).length) return '';
      return Object.entries(yr).map(([topic, res]) => `
        <div class="yt-topic">
          <div class="yt-topic-name">${topic}</div>
          <div class="yt-links">
            <a href="${res.theory}"   target="_blank" class="yt-btn yt-theory">Theory</a>
            <a href="${res.practice}" target="_blank" class="yt-btn yt-practice">Practice</a>
            ${(res.channels || []).map(ch =>
              `<a href="${ch.url}" target="_blank" class="yt-btn yt-channel">${ch.name}</a>`
            ).join('')}
          </div>
        </div>`).join('');
    })();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Interview Prep — ${jobTitle}${company ? ' @ ' + company : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700;800&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {
    --ink:        oklch(18% 0.06 248);
    --ink-mid:    oklch(38% 0.06 248);
    --ink-soft:   oklch(55% 0.04 248);
    --ink-muted:  oklch(70% 0.03 248);
    --accent:     oklch(45% 0.18 248);
    --accent-dim: oklch(55% 0.14 248);
    --surface:    oklch(100% 0 0);
    --bg:         oklch(97% 0.008 248);
    --bg-tint:    oklch(95% 0.015 248);
    --border:     oklch(90% 0.012 248);

    --adv-bg:  oklch(95% 0.025 15);
    --adv-fg:  oklch(35% 0.12 15);
    --adv-bd:  oklch(80% 0.07 15);
    --int-bg:  oklch(96% 0.025 75);
    --int-fg:  oklch(38% 0.1 75);
    --int-bd:  oklch(82% 0.08 75);
    --beg-bg:  oklch(96% 0.02 155);
    --beg-fg:  oklch(35% 0.1 155);
    --beg-bd:  oklch(82% 0.07 155);

    --flag-bg: oklch(96% 0.022 60);
    --flag-fg: oklch(40% 0.12 60);

    --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
    --space-4: 16px; --space-5: 24px; --space-6: 32px;
    --space-7: 48px;

    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Source Sans 3', 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--ink);
    font-size: 14px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }

  a { color: var(--accent); text-decoration: none; }

  /* ── Page shell ──────────────────────────────────── */
  .page { max-width: 980px; margin: 0 auto; }

  /* ── Hero ────────────────────────────────────────── */
  .hero {
    background: var(--ink);
    color: var(--surface);
    padding: var(--space-7) var(--space-6) var(--space-6);
  }
  .hero-eyebrow {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: oklch(75% 0.08 248);
    margin-bottom: var(--space-2);
  }
  .hero-title {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: clamp(26px, 4vw, 38px);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.3px;
  }
  .hero-company {
    font-size: 17px;
    font-weight: 600;
    color: oklch(82% 0.06 248);
    margin-top: var(--space-1);
  }
  .hero-meta {
    font-size: 12px;
    color: oklch(60% 0.04 248);
    margin-top: var(--space-4);
  }

  /* ── Content grid ────────────────────────────────── */
  .content { padding: var(--space-6) var(--space-5); }

  .section { margin-bottom: var(--space-5); }

  /* ── Section header ──────────────────────────────── */
  .sec-head {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: var(--space-3);
  }

  /* ── Card ────────────────────────────────────────── */
  .card {
    background: var(--surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .card-head {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--ink-mid);
    padding: var(--space-4) var(--space-5);
    background: var(--bg-tint);
    border-bottom: 1px solid var(--border);
  }
  .card-body { padding: var(--space-4) var(--space-5); }

  /* ── Two-column ──────────────────────────────────── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  @media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

  /* ── Focus areas ─────────────────────────────────── */
  .focus-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-3);
  }
  .focus-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    background: var(--bg-tint);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
  }
  .focus-num {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 20px;
    font-weight: 800;
    color: var(--accent);
    line-height: 1;
    flex-shrink: 0;
    min-width: 20px;
  }
  .focus-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    padding-top: 2px;
    line-height: 1.4;
  }

  /* ── Tech stack ──────────────────────────────────── */
  .tech-wrap { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .tech-tag {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid;
  }
  .tech-tag.beginner     { background: var(--beg-bg); color: var(--beg-fg); border-color: var(--beg-bd); }
  .tech-tag.intermediate { background: var(--int-bg); color: var(--int-fg); border-color: var(--int-bd); }
  .tech-tag.advanced     { background: var(--adv-bg); color: var(--adv-fg); border-color: var(--adv-bd); }
  .tech-name { font-weight: 700; }
  .tech-level {
    font-size: 9px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  /* ── Concepts ────────────────────────────────────── */
  .concept-group { margin-bottom: var(--space-4); }
  .concept-group:last-child { margin-bottom: 0; }
  .concept-cat {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--ink-soft);
    margin-bottom: var(--space-2);
  }
  .concept-pills { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); }
  .pill {
    background: var(--bg-tint);
    color: var(--ink-mid);
    border: 1px solid var(--border);
    padding: 2px 10px;
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  /* ── Interview rounds ────────────────────────────── */
  .round {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--border);
  }
  .round:last-child { border-bottom: none; padding-bottom: 0; }
  .round:first-child { padding-top: 0; }
  .round-badge {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 22px;
    font-weight: 800;
    color: var(--accent);
    line-height: 1;
    min-width: 28px;
    flex-shrink: 0;
  }
  .round-body { flex: 1; min-width: 0; }
  .round-header { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .round-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
  }
  .round-dur {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-muted);
    background: var(--bg-tint);
    border: 1px solid var(--border);
    padding: 1px 7px;
    border-radius: 10px;
  }
  .round-topics {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    margin-top: var(--space-2);
  }
  .round-topic {
    font-size: 11px;
    color: var(--accent);
    background: oklch(96% 0.02 248);
    border: 1px solid oklch(88% 0.04 248);
    padding: 1px 8px;
    border-radius: 10px;
  }
  .round-desc { font-size: 12px; color: var(--ink-soft); margin-top: var(--space-2); }

  /* ── Weekly plan ─────────────────────────────────── */
  .week-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-4);
  }
  .week-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .week-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--accent);
    padding: var(--space-2) var(--space-3);
  }
  .week-badge {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 15px;
    font-weight: 800;
    color: var(--surface);
    opacity: 0.7;
  }
  .week-title {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: var(--surface);
    letter-spacing: 0.5px;
  }
  .week-body { padding: var(--space-3); }
  .week-list { list-style: none; }
  .week-list li {
    font-size: 12px;
    color: var(--ink-mid);
    padding: 3px 0;
    border-bottom: 1px solid var(--border);
  }
  .week-list li:last-child { border-bottom: none; padding-bottom: 0; }
  .week-list li::before { content: '›'; color: var(--accent); margin-right: 6px; font-weight: 700; }
  .week-day {
    font-size: 12px;
    color: var(--ink-mid);
    padding: 3px 0;
    display: flex;
    gap: var(--space-2);
    border-bottom: 1px solid var(--border);
  }
  .week-day:last-child { border-bottom: none; }
  .week-day-label {
    font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
    min-width: 44px;
  }
  .week-text { font-size: 12px; color: var(--ink-mid); }

  /* ── Behavioral questions ────────────────────────── */
  .bq-list { display: flex; flex-direction: column; gap: 0; }
  .bq-item {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .bq-item:last-child { border-bottom: none; }
  .bq-num {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent-dim);
    background: oklch(95% 0.02 248);
    border: 1px solid oklch(87% 0.04 248);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    margin-top: 1px;
    letter-spacing: 0.5px;
  }
  .bq-text { font-size: 13px; color: var(--ink); line-height: 1.45; }

  /* ── Red flags ───────────────────────────────────── */
  .flag-item {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3) var(--space-4);
    background: var(--flag-bg);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
    font-size: 13px;
    color: var(--ink);
  }
  .flag-item:last-child { margin-bottom: 0; }
  .flag-icon {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 13px;
    font-weight: 800;
    color: var(--flag-fg);
    background: oklch(88% 0.06 60);
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── Company insights ────────────────────────────── */
  .ci-row {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
  }
  .ci-row:last-child { border-bottom: none; padding-bottom: 0; }
  .ci-row:first-child { padding-top: 0; }
  .ci-label {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--accent);
    min-width: 90px;
    flex-shrink: 0;
    padding-top: 2px;
  }
  .ci-prose { font-size: 13px; color: var(--ink-mid); line-height: 1.5; flex: 1; }
  .ci-chips { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); flex: 1; }
  .ci-chip {
    background: var(--bg-tint);
    color: var(--ink-mid);
    border: 1px solid var(--border);
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  /* ── YouTube resources ───────────────────────────── */
  .yt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-4);
  }
  .yt-topic {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .yt-topic-name {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--ink-mid);
    padding: var(--space-2) var(--space-3);
    background: var(--bg-tint);
    border-bottom: 1px solid var(--border);
  }
  .yt-links {
    padding: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .yt-btn {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    border: 1px solid;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .yt-btn:hover { opacity: 0.75; }
  .yt-theory   { background: oklch(96% 0.018 15);  color: oklch(38% 0.14 15);  border-color: oklch(82% 0.07 15); }
  .yt-practice { background: oklch(96% 0.018 60);  color: oklch(38% 0.13 60);  border-color: oklch(82% 0.07 60); }
  .yt-channel  { background: var(--bg-tint); color: var(--ink-soft); border-color: var(--border); }

  /* ── Divider ─────────────────────────────────────── */
  .divider { height: 1px; background: var(--border); margin: var(--space-5) 0; }

  /* ── Footer ──────────────────────────────────────── */
  .footer {
    text-align: center;
    font-size: 11px;
    color: var(--ink-muted);
    padding: var(--space-6) var(--space-5) var(--space-7);
  }
</style>
</head>
<body>
<div class="page">

  <!-- Hero -->
  <div class="hero">
    <div class="hero-eyebrow">Interview Preparation Guide</div>
    <div class="hero-title">${jobTitle}</div>
    ${company ? `<div class="hero-company">${company}</div>` : ''}
    <div class="hero-meta">Generated ${generatedAt}</div>
  </div>

  <div class="content">

    ${focusAreasHtml ? `
    <div class="section">
      <div class="sec-head">Key Focus Areas</div>
      <div class="focus-grid">${focusAreasHtml}</div>
    </div>` : ''}

    <div class="two-col">

      ${techStackHtml ? `
      <div class="section">
        <div class="card">
          <div class="card-head">Tech Stack to Prepare</div>
          <div class="card-body">
            <div class="tech-wrap">${techStackHtml}</div>
          </div>
        </div>
      </div>` : ''}

      ${roundsHtml ? `
      <div class="section">
        <div class="card">
          <div class="card-head">Interview Rounds</div>
          <div class="card-body">${roundsHtml}</div>
        </div>
      </div>` : ''}

    </div>

    ${conceptsHtml ? `
    <div class="section">
      <div class="card">
        <div class="card-head">Concepts to Master</div>
        <div class="card-body">${conceptsHtml}</div>
      </div>
    </div>` : ''}

    ${weeklyHtml ? `
    <div class="section">
      <div class="sec-head">4-Week Preparation Schedule</div>
      <div class="week-grid">${weeklyHtml}</div>
    </div>` : ''}

    ${behavioralHtml ? `
    <div class="section">
      <div class="card">
        <div class="card-head">Behavioral Questions</div>
        <div class="bq-list">${behavioralHtml}</div>
      </div>
    </div>` : ''}

    <div class="two-col">

      ${flagsHtml ? `
      <div class="section">
        <div class="card">
          <div class="card-head">Common Mistakes to Avoid</div>
          <div class="card-body">${flagsHtml}</div>
        </div>
      </div>` : ''}

      ${companyHtml ? `
      <div class="section">
        <div class="card">
          <div class="card-head">Company Insights</div>
          <div class="card-body">${companyHtml}</div>
        </div>
      </div>` : ''}

    </div>

    ${ytHtml ? `
    <div class="section">
      <div class="sec-head">YouTube Learning Resources</div>
      <div class="yt-grid">${ytHtml}</div>
    </div>` : ''}

    <div class="footer">Hunt-Job · AI-Powered Job Search Agent</div>

  </div>
</div>
</body>
</html>`;
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
