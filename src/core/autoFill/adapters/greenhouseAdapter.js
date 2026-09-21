/**
 * greenhouseAdapter.js
 * Handles Greenhouse ATS forms (boards.greenhouse.io).
 * Supports: iframe/fragment navigation, all personal fields, education, resume upload.
 */

async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      if (!(await el.isVisible())) continue;
      if (!(await el.isEditable())) continue;
      await el.click();
      await el.fill(String(value));
      return sel;
    } catch { /* try next */ }
  }
  return null;
}

async function trySelect(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      if (!(await el.isVisible())) continue;
      // Try exact match first, then partial
      try { await el.selectOption({ label: value }); return sel; } catch {}
      try { await el.selectOption({ value }); return sel; } catch {}
    } catch { /* try next */ }
  }
  return null;
}

async function uploadResume(page, resumePath) {
  if (!resumePath) return false;
  const selectors = [
    'input[type="file"][id*="resume" i]',
    'input[type="file"][name*="resume" i]',
    'input[type="file"][accept*="pdf" i]',
    'input[type="file"]',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      await el.setInputFiles(resumePath);
      // Wait briefly for upload to register
      await page.waitForTimeout(1500);
      return true;
    } catch { /* try next */ }
  }
  return false;
}

const GH_PERSONAL = [
  { field: 'firstName',      selectors: ['input#first_name', 'input[name="job_application[first_name]"]', 'input[autocomplete="given-name"]'] },
  { field: 'lastName',       selectors: ['input#last_name',  'input[name="job_application[last_name]"]',  'input[autocomplete="family-name"]'] },
  { field: 'email',          selectors: ['input#email',      'input[name="job_application[email]"]',      'input[type="email"]'] },
  { field: 'phone',          selectors: ['input#phone',      'input[name="job_application[phone]"]',      'input[type="tel"]'] },
  { field: 'location',       selectors: ['input[id*="location" i]', 'input[name*="location" i]'] },
  { field: 'currentTitle',   selectors: ['input[id*="title" i]', 'input[name*="title" i]', 'input[placeholder*="title" i]'] },
  { field: 'currentCompany', selectors: ['input[id*="company" i]', 'input[name*="company" i]'] },
  { field: 'linkedin',       selectors: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]', 'input[placeholder*="linkedin" i]'] },
  { field: 'github',         selectors: ['input[name*="github" i]',   'input[id*="github" i]'] },
  { field: 'website',        selectors: ['input[name*="website" i]',  'input[name*="portfolio" i]', 'input[id*="website" i]'] },
  { field: 'twitter',        selectors: ['input[name*="twitter" i]',  'input[id*="twitter" i]'] },
];

const GH_COVER_LETTER = [
  'textarea[name*="cover" i]',
  'textarea[id*="cover" i]',
  'textarea[placeholder*="cover letter" i]',
  '#cover_letter_text',
  'textarea[name="job_application[cover_letter_text]"]',
];

const GH_EDUCATION = [
  { field: 'educationSchool', selectors: ['input[name*="school" i]', 'input[id*="school" i]', 'input[placeholder*="school" i]', 'input[placeholder*="institution" i]'] },
  { field: 'educationDegree', selectors: ['input[name*="degree" i]', 'input[id*="degree" i]', 'select[name*="degree" i]'] },
  { field: 'educationField',  selectors: ['input[name*="discipline" i]', 'input[name*="field_of_study" i]', 'input[id*="discipline" i]'] },
  { field: 'educationYear',   selectors: ['input[name*="end_date" i]', 'input[name*="graduation" i]', 'input[id*="end_date" i]'] },
];

const CONTROL_SELECTOR =
  'input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]), textarea, select';

async function labelOf(el) {
  return el.evaluate(node => {
    const byFor = node.id && document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
    const wrap = node.closest('.field, .application--question, [class*="question" i], [class*="field" i]');
    const inWrap = wrap && wrap.querySelector('label');
    const txt = (byFor && byFor.textContent) || node.getAttribute('aria-label') ||
      (inWrap && inWrap.textContent) || (node.closest('label') && node.closest('label').textContent) || '';
    return String(txt).replace(/\s+/g, ' ').replace(/\*/g, '').trim().slice(0, 200);
  });
}

async function fillOne(el, value) {
  const tag = await el.evaluate(n => n.tagName.toLowerCase());
  if (tag === 'select') {
    try { await el.selectOption({ label: value }); return true; } catch {}
    try { await el.selectOption({ value }); return true; } catch {}
    // partial label match ("India" vs "India (+91)")
    const options = await el.evaluate(n => [...n.options].map(o => ({ v: o.value, t: o.textContent.trim() })));
    const hit = options.find(o => o.t.toLowerCase().includes(value.toLowerCase()));
    if (hit) { await el.selectOption({ value: hit.v }); return true; }
    return false;
  }
  await el.click();
  await el.fill(value);
  // React-select style comboboxes need the option confirmed
  const role = await el.getAttribute('role');
  if (role === 'combobox') {
    try { await el.press('Enter'); } catch { /* option list may already be closed */ }
  }
  return true;
}

/**
 * B-30: fills custom questions (country, notice period, CTC, work authorization…)
 * from the user's own `applicationAnswers`. Empty controls only; a question with
 * no known answer is left for the user and reported in `unanswered`.
 * @returns {Promise<{filled: string[], unanswered: string[]}>}
 */
export async function fillCustomQuestions(context, answers) {
  const { answerForQuestion } = await import('../profileMapper.js');
  const filled = [];
  const unanswered = [];
  let controls = [];
  try { controls = await context.$$(CONTROL_SELECTOR); } catch { return { filled, unanswered }; }

  for (const el of controls) {
    try {
      if (!(await el.isVisible()) || !(await el.isEditable())) continue;
      const current = await el.evaluate(n => (n.tagName === 'SELECT' ? n.selectedOptions[0]?.textContent?.trim() : n.value) || '');
      if (current && !/^(select|please|choose|pick|--|—|\.\.\.)/i.test(current)) continue;
      const label = await labelOf(el);
      if (!label) continue;
      const answer = answerForQuestion(label, answers);
      if (!answer) {
        const required = await el.evaluate(n => n.required || n.getAttribute('aria-required') === 'true');
        if (required) unanswered.push(label);
        continue;
      }
      if (await fillOne(el, answer)) filled.push(label);
    } catch { /* leave this one for the user */ }
  }
  return { filled, unanswered };
}

const GH_COVER_MANUAL_BUTTONS = [
  '[data-field*="cover" i] button:has-text("Enter manually")',
  '#cover_letter button:has-text("Enter manually")',
  'div:has(> label:has-text("Cover Letter")) button:has-text("Enter manually")',
];

/** New Greenhouse boards hide the cover-letter textarea behind "Enter manually". */
async function revealCoverLetter(context) {
  for (const sel of GH_COVER_MANUAL_BUTTONS) {
    try {
      const btn = await context.$(sel);
      if (btn && (await btn.isVisible())) { await btn.click(); return true; }
    } catch { /* try next */ }
  }
  return false;
}

export async function runGreenhouseAdapter(page, fieldValues) {
  const filled  = [];
  const skipped = [];

  // Greenhouse may embed the form in an iframe on some pages
  // Try direct first, then iframe
  async function fillFields(context) {
    for (const { field, selectors } of GH_PERSONAL) {
      const value = fieldValues[field];
      if (!value) { skipped.push(field); continue; }
      const ok = await tryFill(context, selectors, value);
      if (ok) filled.push(field);
      else skipped.push(field);
    }

    // Cover letter
    if (fieldValues.coverLetter) {
      let clFilled = false;
      await revealCoverLetter(context);
      for (const sel of GH_COVER_LETTER) {
        try {
          const el = await context.$(sel);
          if (!el || !(await el.isVisible())) continue;
          await el.click();
          await el.fill(fieldValues.coverLetter);
          filled.push('coverLetter');
          clFilled = true;
          break;
        } catch {}
      }
      if (!clFilled) skipped.push('coverLetter');
    }

    // Education fields
    for (const { field, selectors } of GH_EDUCATION) {
      const value = fieldValues[field];
      if (!value) continue;
      // Try as input first, then as select
      const ok = await tryFill(context, selectors, value)
              || await trySelect(context, selectors, value);
      if (ok) filled.push(field);
    }

    // Custom questions: country, notice period, CTC, work authorization (B-30)
    const custom = await fillCustomQuestions(context, fieldValues.answers);
    filled.push(...custom.filled.map(l => `question: ${l}`));
    skipped.push(...custom.unanswered.map(l => `question (needs your answer): ${l}`));
  }

  // Upload the resume FIRST: Greenhouse parses it and pre-fills fields, and our
  // profile values then overwrite/complete whatever the parser got wrong or missed.
  const uploaded = await uploadResume(page, fieldValues.resumePath);
  if (uploaded) await page.waitForTimeout(3000);

  await fillFields(page);

  // Attempt iframe fallback if very few fields filled
  if (filled.length < 2) {
    try {
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const hasInput = await frame.$('input#first_name, input[name*="job_application"]');
          if (hasInput) {
            await fillFields(frame);
            break;
          }
        } catch {}
      }
    } catch {}
  }

  return { filled, skipped, uploaded };
}
