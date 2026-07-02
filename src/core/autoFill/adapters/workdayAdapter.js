/**
 * workdayAdapter.js
 * Handles Workday ATS forms (myworkdayjobs.com).
 *
 * Workday is the most complex ATS:
 * - Multi-step form (typically 3-5 steps)
 * - Deep iframes
 * - Dynamic React-driven IDs
 * - Very slow page loads
 *
 * Strategy: Use Playwright's getByLabel() API (resilient to dynamic IDs),
 * navigate step by step, and upload resume on whichever step shows a file input.
 */

const STEP_TIMEOUT  = 35000; // Workday pages are slow
const FILL_DELAY    = 80;    // ms between keystrokes for React fields

async function waitForFormReady(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: STEP_TIMEOUT });
  } catch {
    // networkidle timeout OK — Workday has long-running XHR
    await page.waitForTimeout(3000);
  }
}

/**
 * Fill a field using getByLabel (resilient) or fallback CSS selectors.
 */
async function fillByLabel(page, labelText, value, options = {}) {
  const { pressSequentially = false } = options;
  try {
    const locator = page.getByLabel(labelText, { exact: false });
    const count = await locator.count();
    if (count === 0) return false;
    const el = locator.first();
    if (!(await el.isVisible({ timeout: 3000 }))) return false;
    if (!(await el.isEditable({ timeout: 3000 }))) return false;
    await el.click();
    if (pressSequentially) {
      await el.pressSequentially(String(value), { delay: FILL_DELAY });
    } else {
      await el.fill(String(value));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload resume on the current step.
 */
async function tryUploadResume(page, resumePath) {
  if (!resumePath) return false;
  const selectors = [
    'input[type="file"]',
    'input[data-automation-id*="file" i]',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      await el.setInputFiles(resumePath);
      await page.waitForTimeout(2000);
      return true;
    } catch {}
  }
  return false;
}

/**
 * Click "Next" or "Save and Continue" button to advance to next step.
 */
async function clickNext(page) {
  const nextSelectors = [
    'button[data-automation-id="bottom-navigation-next-button"]',
    'button[data-automation-id="pageFooter-button-next"]',
    'button:has-text("Next")',
    'button:has-text("Save and Continue")',
    'button:has-text("Continue")',
    '[data-automation-id="nextButton"]',
  ];
  for (const sel of nextSelectors) {
    try {
      const btn = await page.$(sel);
      if (!btn || !(await btn.isVisible())) continue;
      await btn.click();
      await waitForFormReady(page);
      return true;
    } catch {}
  }
  return false;
}

/**
 * Step 1: My Information (personal details)
 */
async function fillStep1(page, fieldValues, filled, skipped) {
  const labelMap = [
    { label: 'First Name',           field: 'firstName' },
    { label: 'Last Name',            field: 'lastName' },
    { label: 'Email',                field: 'email' },
    { label: 'Phone',                field: 'phone' },
    { label: 'Phone Number',         field: 'phone' },
    { label: 'Address Line 1',       field: 'location' },
    { label: 'City',                 field: 'location' },
    { label: 'LinkedIn URL',         field: 'linkedin' },
    { label: 'LinkedIn Profile URL', field: 'linkedin' },
    { label: 'Website',              field: 'website' },
    { label: 'How Did You Hear',     field: null }, // skip
  ];

  for (const { label, field } of labelMap) {
    if (!field) continue;
    const value = fieldValues[field];
    if (!value) continue;
    const ok = await fillByLabel(page, label, value);
    if (ok && !filled.includes(field)) filled.push(field);
  }

  // Resume upload often appears on step 1
  const uploaded = await tryUploadResume(page, fieldValues.resumePath);
  return uploaded;
}

/**
 * Step 2: My Experience (work history + cover letter)
 */
async function fillStep2(page, fieldValues, filled, skipped) {
  let uploaded = false;

  // Resume upload may also appear here
  uploaded = await tryUploadResume(page, fieldValues.resumePath);

  // Cover letter / additional information textarea
  const coverSelectors = [
    'textarea[data-automation-id*="cover" i]',
    'textarea[aria-label*="cover letter" i]',
    'textarea[placeholder*="cover" i]',
    'textarea',
  ];
  if (fieldValues.coverLetter) {
    for (const sel of coverSelectors) {
      try {
        const el = await page.$(sel);
        if (!el || !(await el.isVisible())) continue;
        await el.click();
        await el.fill(fieldValues.coverLetter);
        if (!filled.includes('coverLetter')) filled.push('coverLetter');
        break;
      } catch {}
    }
  }

  return uploaded;
}

/**
 * Step 3: My Education
 */
async function fillStep3(page, fieldValues, filled, skipped) {
  const labelMap = [
    { label: 'School',           field: 'educationSchool' },
    { label: 'School or University', field: 'educationSchool' },
    { label: 'Field of Study',   field: 'educationField' },
    { label: 'Degree',           field: 'educationDegree' },
    { label: 'End Date',         field: 'educationYear' },
  ];
  for (const { label, field } of labelMap) {
    const value = fieldValues[field];
    if (!value) continue;
    const ok = await fillByLabel(page, label, value);
    if (ok && !filled.includes(field)) filled.push(field);
  }
}

/**
 * Main Workday adapter entry point.
 */
export async function runWorkdayAdapter(page, fieldValues) {
  const filled  = [];
  const skipped = [];
  let   uploaded = false;

  // Wait for Workday to load (very slow)
  await waitForFormReady(page);

  // Determine how many steps there are (usually 3-5)
  // We'll iterate up to 5 steps, filling what we can on each
  const MAX_STEPS = 5;

  for (let step = 1; step <= MAX_STEPS; step++) {
    // Detect which step we're on by looking at page heading or URL
    const pageText = await page.evaluate(() =>
      document.body?.innerText?.slice(0, 500) || ''
    ).catch(() => '');

    const isInfoStep   = /my information|personal|contact/i.test(pageText);
    const isExpStep    = /my experience|work history|resume|cover/i.test(pageText);
    const isEduStep    = /education|school|university|degree/i.test(pageText);
    const isSubmitStep = /review|submit|application complete/i.test(pageText);

    if (isSubmitStep) break; // Don't auto-submit

    if (isInfoStep || step === 1) {
      const up = await fillStep1(page, fieldValues, filled, skipped);
      if (up) uploaded = true;
    }
    if (isExpStep || step === 2) {
      const up = await fillStep2(page, fieldValues, filled, skipped);
      if (up) uploaded = true;
    }
    if (isEduStep || step === 3) {
      await fillStep3(page, fieldValues, filled, skipped);
    }

    // Try to advance to next step
    const advanced = await clickNext(page);
    if (!advanced) break; // No more "Next" button — likely on last step or submit page
  }

  return { filled, skipped, uploaded };
}
