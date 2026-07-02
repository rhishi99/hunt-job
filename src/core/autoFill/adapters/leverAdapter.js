/**
 * leverAdapter.js
 * Handles Lever ATS forms (jobs.lever.co).
 * Supports: basic fields, cover letter, resume upload, React event firing.
 */

/** Fire React's synthetic onChange on an element (needed for Lever's React forms) */
async function fireReactChange(page, selector) {
  await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, el.value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector);
}

/**
 * Try to fill a field by trying each selector in order.
 * Returns the selector that worked, or null.
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
      await fireReactChange(page, sel);
      return sel;
    } catch { /* try next */ }
  }
  return null;
}

/** Try to fill a textarea by trying each selector. */
async function tryFillTextarea(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      if (!(await el.isVisible())) continue;
      await el.click();
      await el.fill(String(value));
      return sel;
    } catch { /* try next */ }
  }
  return null;
}

/** Upload a resume file. Returns true on success. */
async function uploadResume(page, resumePath) {
  if (!resumePath) return false;
  const fileInputSelectors = [
    'input[type="file"][name*="resume" i]',
    'input[type="file"][accept*="pdf" i]',
    'input[type="file"]',
  ];
  for (const sel of fileInputSelectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      await el.setInputFiles(resumePath);
      return true;
    } catch { /* try next */ }
  }
  return false;
}

const LEVER_FIELDS = [
  { field: 'fullName',        selectors: ['input#name', 'input[name="name"]', 'input[placeholder*="full name" i]'] },
  { field: 'email',           selectors: ['input#email', 'input[name="email"]', 'input[type="email"]'] },
  { field: 'phone',           selectors: ['input#phone', 'input[name="phone"]', 'input[type="tel"]'] },
  { field: 'currentCompany',  selectors: ['input#org', 'input[name="org"]', 'input[placeholder*="company" i]'] },
  { field: 'currentTitle',    selectors: ['input[name="title"]', 'input[placeholder*="title" i]'] },
  { field: 'location',        selectors: ['input[name="location"]', 'input[placeholder*="location" i]'] },
  { field: 'linkedin',        selectors: ['input[name="urls[LinkedIn]"]', 'input[placeholder*="LinkedIn" i]', 'input[id*="linkedin" i]'] },
  { field: 'github',          selectors: ['input[name="urls[GitHub]"]', 'input[placeholder*="GitHub" i]', 'input[id*="github" i]'] },
  { field: 'website',         selectors: ['input[name="urls[Portfolio]"]', 'input[placeholder*="portfolio" i]', 'input[placeholder*="website" i]'] },
  { field: 'twitter',         selectors: ['input[name="urls[Twitter]"]', 'input[placeholder*="twitter" i]'] },
];

const LEVER_COVER_LETTER_SELECTORS = [
  'textarea[name*="comments" i]',
  'textarea[name*="cover" i]',
  'textarea[id*="cover" i]',
  'textarea[placeholder*="cover letter" i]',
  'textarea[aria-label*="cover letter" i]',
  '.application-additional textarea',
  'textarea',
];

/**
 * Run the Lever adapter.
 * @param {object} page  — Playwright page
 * @param {object} fieldValues — from profileMapper.buildFieldValues()
 * @returns {object} { filled: string[], skipped: string[], uploaded: boolean }
 */
export async function runLeverAdapter(page, fieldValues) {
  const filled  = [];
  const skipped = [];

  for (const { field, selectors } of LEVER_FIELDS) {
    const value = fieldValues[field];
    if (!value) { skipped.push(field); continue; }
    const ok = await tryFill(page, selectors, value);
    if (ok) filled.push(field);
    else skipped.push(field);
  }

  // Cover letter
  if (fieldValues.coverLetter) {
    const ok = await tryFillTextarea(page, LEVER_COVER_LETTER_SELECTORS, fieldValues.coverLetter);
    if (ok) filled.push('coverLetter');
    else skipped.push('coverLetter');
  }

  // Resume upload
  const uploaded = await uploadResume(page, fieldValues.resumePath);

  return { filled, skipped, uploaded };
}
