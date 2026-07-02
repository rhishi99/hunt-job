/**
 * smartRecruitersAdapter.js
 * Handles SmartRecruiters ATS forms (jobs.smartrecruiters.com).
 * Uses clean label-based selectors + handles dropdown selects.
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
    } catch {}
  }
  return null;
}

async function trySelect(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el || !(await el.isVisible())) continue;
      try { await el.selectOption({ label: value }); return sel; } catch {}
      try { await el.selectOption({ value });       return sel; } catch {}
    } catch {}
  }
  return null;
}

async function fillByLabel(page, labelText, value) {
  try {
    const locator = page.getByLabel(labelText, { exact: false });
    if (await locator.count() === 0) return false;
    const el = locator.first();
    if (!(await el.isVisible({ timeout: 3000 }))) return false;
    if (!(await el.isEditable({ timeout: 3000 }))) return false;
    await el.fill(String(value));
    return true;
  } catch {
    return false;
  }
}

async function uploadResume(page, resumePath) {
  if (!resumePath) return false;
  const selectors = [
    'input[type="file"][accept*="pdf" i]',
    'input[type="file"]',
    '[data-qa="resume-upload"] input',
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

const SR_FIELDS = [
  { field: 'firstName',       selectors: ['input[name="firstName"]', 'input[id="firstName"]', 'input[data-qa="firstName"]'] },
  { field: 'lastName',        selectors: ['input[name="lastName"]',  'input[id="lastName"]',  'input[data-qa="lastName"]'] },
  { field: 'email',           selectors: ['input[name="email"]',     'input[id="email"]',     'input[type="email"]'] },
  { field: 'phone',           selectors: ['input[name="phone"]',     'input[id="phone"]',     'input[type="tel"]'] },
  { field: 'location',        selectors: ['input[name="location"]',  'input[id="city"]',      'input[placeholder*="city" i]'] },
  { field: 'currentTitle',    selectors: ['input[name="currentTitle"]', 'input[id*="title" i]', 'input[placeholder*="job title" i]'] },
  { field: 'currentCompany',  selectors: ['input[name="currentCompany"]', 'input[placeholder*="company" i]'] },
  { field: 'linkedin',        selectors: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'] },
  { field: 'website',         selectors: ['input[name*="website" i]', 'input[name*="portfolio" i]'] },
  { field: 'github',          selectors: ['input[name*="github" i]',  'input[id*="github" i]'] },
  { field: 'yearsOfExperience', selectors: ['input[name*="yearsOfExperience" i]', 'input[id*="experience" i]'] },
];

// SmartRecruiters has work authorization as a dropdown
const SR_DROPDOWNS = [
  {
    field: 'workAuthorization',
    selectors: ['select[name*="authorization" i]', 'select[id*="authorization" i]', 'select[data-qa*="authorization" i]'],
    labelText: 'Work Authorization',
  },
];

const SR_COVER_LETTER = [
  'textarea[name*="message" i]',
  'textarea[name*="cover" i]',
  'textarea[id*="cover" i]',
  'textarea[placeholder*="cover letter" i]',
  'textarea[data-qa*="cover" i]',
];

export async function runSmartRecruitersAdapter(page, fieldValues) {
  const filled  = [];
  const skipped = [];

  // Wait for SR form to load (usually fast)
  try {
    await page.waitForSelector('input[name="firstName"], input[type="email"]', { timeout: 15000 });
  } catch {}

  // Fill standard fields
  for (const { field, selectors } of SR_FIELDS) {
    const value = fieldValues[field];
    if (!value) { skipped.push(field); continue; }
    const ok = await tryFill(page, selectors, value)
            || await fillByLabel(page, field, value);
    if (ok) filled.push(field);
    else skipped.push(field);
  }

  // Dropdowns
  for (const { field, selectors, labelText } of SR_DROPDOWNS) {
    const value = fieldValues[field];
    if (!value) continue;
    const ok = await trySelect(page, selectors, value);
    if (ok) filled.push(field);
  }

  // Cover letter
  if (fieldValues.coverLetter) {
    let clFilled = false;
    for (const sel of SR_COVER_LETTER) {
      try {
        const el = await page.$(sel);
        if (!el || !(await el.isVisible())) continue;
        await el.fill(fieldValues.coverLetter);
        filled.push('coverLetter');
        clFilled = true;
        break;
      } catch {}
    }
    if (!clFilled) skipped.push('coverLetter');
  }

  const uploaded = await uploadResume(page, fieldValues.resumePath);

  return { filled, skipped, uploaded };
}
