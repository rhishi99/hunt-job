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
  }

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

  const uploaded = await uploadResume(page, fieldValues.resumePath);

  return { filled, skipped, uploaded };
}
