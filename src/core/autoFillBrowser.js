import { chromium } from 'playwright';

// Platform-specific selectors — these are reliable because Lever/Greenhouse use fixed IDs
const PLATFORM_SELECTORS = {
  lever: [
    { field: 'fullName',       selectors: ['input#name', 'input[name="name"]'] },
    { field: 'email',          selectors: ['input#email', 'input[name="email"]'] },
    { field: 'phone',          selectors: ['input#phone', 'input[name="phone"]'] },
    { field: 'currentCompany', selectors: ['input#org', 'input[name="org"]'] },
    { field: 'linkedin',       selectors: ['input[name="urls[LinkedIn]"]', 'input[placeholder*="LinkedIn" i]'] },
    { field: 'github',         selectors: ['input[name="urls[GitHub]"]', 'input[placeholder*="GitHub" i]'] },
    { field: 'website',        selectors: ['input[name="urls[Portfolio]"]', 'input[placeholder*="portfolio" i]', 'input[placeholder*="website" i]'] },
  ],
  greenhouse: [
    { field: 'firstName',      selectors: ['input#first_name', 'input[name="job_application[first_name]"]', 'input[autocomplete="given-name"]'] },
    { field: 'lastName',       selectors: ['input#last_name', 'input[name="job_application[last_name]"]', 'input[autocomplete="family-name"]'] },
    { field: 'email',          selectors: ['input#email', 'input[name="job_application[email]"]', 'input[type="email"]'] },
    { field: 'phone',          selectors: ['input#phone', 'input[name="job_application[phone]"]', 'input[type="tel"]'] },
    { field: 'linkedin',       selectors: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]', 'input[placeholder*="linkedin" i]'] },
    { field: 'github',         selectors: ['input[name*="github" i]', 'input[id*="github" i]'] },
    { field: 'website',        selectors: ['input[name*="website" i]', 'input[name*="portfolio" i]'] },
  ],
  generic: [
    { field: 'firstName',      selectors: ['input[name*="first_name" i]', 'input[id*="first_name" i]', 'input[placeholder*="first name" i]', 'input[autocomplete="given-name"]'] },
    { field: 'lastName',       selectors: ['input[name*="last_name" i]', 'input[id*="last_name" i]', 'input[placeholder*="last name" i]', 'input[autocomplete="family-name"]'] },
    { field: 'fullName',       selectors: ['input[name="name"]', 'input[id="name"]', 'input[placeholder*="full name" i]', 'input[aria-label="Name"]'] },
    { field: 'email',          selectors: ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]'] },
    { field: 'phone',          selectors: ['input[type="tel"]', 'input[name*="phone" i]', 'input[name*="mobile" i]'] },
    { field: 'linkedin',       selectors: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]', 'input[placeholder*="linkedin" i]'] },
    { field: 'github',         selectors: ['input[name*="github" i]', 'input[id*="github" i]'] },
    { field: 'website',        selectors: ['input[name*="website" i]', 'input[name*="portfolio" i]'] },
    { field: 'location',       selectors: ['input[name*="location" i]', 'input[name*="city" i]', 'input[placeholder*="city" i]'] },
    { field: 'currentTitle',   selectors: ['input[name*="title" i]', 'input[placeholder*="job title" i]'] },
    { field: 'currentCompany', selectors: ['input[name*="company" i]', 'input[name*="employer" i]', 'input[placeholder*="company" i]'] },
  ],
};

function detectPlatform(url) {
  if (!url) return 'generic';
  if (url.includes('lever.co')) return 'lever';
  if (url.includes('greenhouse.io')) return 'greenhouse';
  return 'generic';
}

function getApplyUrl(url, platform) {
  if (!url) return url;
  if (platform === 'lever') {
    // Strip query params, ensure /apply suffix
    const base = url.split('?')[0].replace(/\/apply$/, '');
    return `${base}/apply`;
  }
  if (platform === 'greenhouse') {
    // Form is embedded on the job page; strip fragment and re-add #app
    return url.split('#')[0] + '#app';
  }
  return url;
}

async function tryFill(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      if (!(await el.isVisible())) continue;
      if (!(await el.isEditable())) continue;
      await el.click();
      await el.fill(String(value));
      // Fire change event for React-controlled inputs
      await page.evaluate(s => {
        const el = document.querySelector(s);
        if (el) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          nativeInputValueSetter?.call(el, el.value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, sel);
      return true;
    } catch {}
  }
  return false;
}

export async function autoFillApplication(jobUrl, applyUrl, profile) {
  const platform = detectPlatform(jobUrl);
  const targetUrl = applyUrl || getApplyUrl(jobUrl, platform);
  const fieldSpec = PLATFORM_SELECTORS[platform];

  const nameParts = (profile.name || '').trim().split(/\s+/);
  const recentCompany = (profile.experience || [])[0]?.company || '';

  const fieldValues = {
    firstName:      nameParts[0] || '',
    lastName:       nameParts.slice(1).join(' ') || '',
    fullName:       profile.name || '',
    email:          profile.email || '',
    phone:          profile.phone || '',
    linkedin:       profile.linkedin || '',
    github:         profile.github || '',
    website:        profile.website || profile.portfolio || '',
    location:       profile.location || '',
    currentTitle:   profile.currentRole || '',
    currentCompany: recentCompany,
  };

  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    // networkidle timeout is OK — page may still have a form
    await page.waitForTimeout(2000);
  }

  const filled = [];
  const skipped = [];

  for (const { field, selectors } of fieldSpec) {
    const value = fieldValues[field];
    if (!value) { skipped.push(field); continue; }
    const ok = await tryFill(page, selectors, value);
    if (ok) filled.push(field);
    else skipped.push(field);
  }

  return { browser, page, platform, targetUrl, filled, skipped, fieldValues };
}
