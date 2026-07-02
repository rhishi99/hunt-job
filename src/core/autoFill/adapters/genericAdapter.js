/**
 * genericAdapter.js
 * AI-powered fallback for unknown job portals.
 *
 * Strategy:
 * 1. Snapshot visible form HTML from the page (trimmed to ~4000 chars)
 * 2. Ask the AI to map profile fields → best CSS selectors
 * 3. Fill all mapped fields
 * 4. Fall back to a broad static-selector sweep if AI mapping fails/is unavailable
 */

import { getActiveClient } from '../../aiClient.js';

// ── Fallback static selectors ─────────────────────────────────────────────────
// These are broad, label/name/placeholder based and work on most generic forms.

const STATIC_FIELDS = [
  { field: 'firstName',        selectors: ['input[name*="first_name" i]', 'input[id*="first_name" i]', 'input[placeholder*="first name" i]', 'input[autocomplete="given-name"]'] },
  { field: 'lastName',         selectors: ['input[name*="last_name" i]',  'input[id*="last_name" i]',  'input[placeholder*="last name" i]',  'input[autocomplete="family-name"]'] },
  { field: 'fullName',         selectors: ['input[name="name"]', 'input[id="name"]', 'input[placeholder*="full name" i]', 'input[aria-label*="name" i]'] },
  { field: 'email',            selectors: ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]'] },
  { field: 'phone',            selectors: ['input[type="tel"]', 'input[name*="phone" i]', 'input[name*="mobile" i]', 'input[id*="phone" i]'] },
  { field: 'linkedin',         selectors: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]', 'input[placeholder*="linkedin" i]'] },
  { field: 'github',           selectors: ['input[name*="github" i]',   'input[id*="github" i]'] },
  { field: 'website',          selectors: ['input[name*="website" i]',  'input[name*="portfolio" i]', 'input[id*="portfolio" i]'] },
  { field: 'location',         selectors: ['input[name*="location" i]', 'input[name*="city" i]',    'input[placeholder*="city" i]'] },
  { field: 'currentTitle',     selectors: ['input[name*="title" i]',    'input[placeholder*="job title" i]', 'input[id*="title" i]'] },
  { field: 'currentCompany',   selectors: ['input[name*="company" i]',  'input[name*="employer" i]', 'input[placeholder*="company" i]'] },
  { field: 'yearsOfExperience',selectors: ['input[name*="years" i]',    'input[name*="experience" i]'] },
  { field: 'skills',           selectors: ['input[name*="skills" i]',   'textarea[name*="skills" i]'] },
];

const STATIC_TEXTAREAS = [
  { field: 'coverLetter', selectors: ['textarea[name*="cover" i]', 'textarea[id*="cover" i]', 'textarea[placeholder*="cover letter" i]', 'textarea[aria-label*="cover" i]'] },
  { field: 'summary',     selectors: ['textarea[name*="summary" i]', 'textarea[name*="about" i]', 'textarea[placeholder*="about" i]', 'textarea[placeholder*="tell us" i]', 'textarea[name*="introduction" i]'] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el || !(await el.isVisible()) || !(await el.isEditable())) continue;
      await el.click();
      await el.fill(String(value));
      // Fire change/input events (handles React, Vue, etc.)
      await page.evaluate(s => {
        const e = document.querySelector(s);
        if (!e) return;
        const proto = e.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(e, e.value);
        e.dispatchEvent(new Event('input',  { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }, sel);
      return sel;
    } catch {}
  }
  return null;
}

async function uploadResume(page, resumePath) {
  if (!resumePath) return false;
  const selectors = [
    'input[type="file"][accept*="pdf" i]',
    'input[type="file"][name*="resume" i]',
    'input[type="file"]',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      await el.setInputFiles(resumePath);
      await page.waitForTimeout(1500);
      return true;
    } catch {}
  }
  return false;
}

// ── AI Field Mapping ──────────────────────────────────────────────────────────

/**
 * Extract a compact representation of the form from the DOM.
 * Returns HTML snippet with just inputs/textareas/labels (≤4000 chars).
 */
async function extractFormSnapshot(page) {
  return page.evaluate(() => {
    const elements = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, label, select')];
    const snippets = elements.map(el => {
      const tag   = el.tagName.toLowerCase();
      const id    = el.id    ? ` id="${el.id}"`     : '';
      const name  = el.name  ? ` name="${el.name}"` : '';
      const type  = el.type  ? ` type="${el.type}"` : '';
      const ph    = el.placeholder ? ` placeholder="${el.placeholder}"` : '';
      const label = el.getAttribute('aria-label') ? ` aria-label="${el.getAttribute('aria-label')}"` : '';
      const text  = el.innerText?.trim().slice(0, 60) || '';
      return `<${tag}${id}${name}${type}${ph}${label}>${text}</${tag}>`;
    });
    return snippets.join('\n').slice(0, 4000);
  }).catch(() => '');
}

/**
 * Ask the AI to map profile field names → best CSS selector strings.
 * Returns an object like: { firstName: 'input#fname', email: 'input[type="email"]', ... }
 */
async function aiMapFields(formSnapshot, fieldValues) {
  try {
    const client = getActiveClient('light');

    const fieldList = Object.keys(fieldValues)
      .filter(k => fieldValues[k] && k !== 'resumePath')
      .join(', ');

    const prompt = `You are helping auto-fill a job application form.
Below is the HTML form structure (inputs, textareas, labels).
Map each profile field to the BEST CSS selector string for that field in this form.
Return ONLY valid JSON: { "fieldName": "cssSelector" }. Use null for fields not found.

Profile fields to map: ${fieldList}

Form HTML:
${formSnapshot}

Rules:
- Use the most specific, stable selector (prefer id > name > placeholder-based)
- For textareas use textarea selectors
- Return ONLY the JSON object, no explanation`;

    const response = await client.messages.create({
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text?.trim() || '';
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ── Main Entry ─────────────────────────────────────────────────────────────────

export async function runGenericAdapter(page, fieldValues) {
  const filled  = [];
  const skipped = [];

  // First: try AI-powered field mapping
  let aiMappingUsed = false;
  try {
    const snapshot = await extractFormSnapshot(page);
    if (snapshot.length > 100) {
      const mapping = await aiMapFields(snapshot, fieldValues);
      if (mapping && typeof mapping === 'object') {
        aiMappingUsed = true;
        for (const [field, selector] of Object.entries(mapping)) {
          if (!selector || !fieldValues[field]) continue;
          try {
            const ok = await tryFill(page, [selector], fieldValues[field]);
            if (ok) filled.push(`${field}(AI)`);
            else skipped.push(field);
          } catch {
            skipped.push(field);
          }
        }
      }
    }
  } catch { /* AI mapping failed, fall through */ }

  // Second: static sweep (fills any fields AI missed)
  for (const { field, selectors } of STATIC_FIELDS) {
    const value = fieldValues[field];
    if (!value || filled.some(f => f.startsWith(field))) continue;
    const ok = await tryFill(page, selectors, value);
    if (ok) filled.push(field);
    else skipped.push(field);
  }

  // Textareas (cover letter + summary)
  for (const { field, selectors } of STATIC_TEXTAREAS) {
    const value = fieldValues[field];
    if (!value || filled.some(f => f.startsWith(field))) continue;
    const ok = await tryFill(page, selectors, value);
    if (ok) filled.push(field);
    else skipped.push(field);
  }

  const uploaded = await uploadResume(page, fieldValues.resumePath);

  return { filled, skipped, uploaded, aiMappingUsed };
}
