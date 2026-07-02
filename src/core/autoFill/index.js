/**
 * src/core/autoFill/index.js
 * Main orchestrator for the auto-fill system.
 *
 * Usage:
 *   import { autoFillApplication } from './autoFill/index.js';
 *   const result = await autoFillApplication(jobUrl, applyUrl, profile, jobContext);
 *
 * Returns:
 *   { browser, page, platform, targetUrl, filled, skipped, uploaded, fieldValues, aiMappingUsed }
 */

import { chromium } from 'playwright';
import { detectPlatform, getApplyUrl, PLATFORM_DISPLAY_NAMES } from './platformDetector.js';
import { buildFieldValues } from './profileMapper.js';

// ── Adapter loader ──────────────────────────────────────────────────────────

async function getAdapter(platform) {
  switch (platform) {
    case 'lever':
      return (await import('./adapters/leverAdapter.js')).runLeverAdapter;
    case 'greenhouse':
      return (await import('./adapters/greenhouseAdapter.js')).runGreenhouseAdapter;
    case 'workday':
      return (await import('./adapters/workdayAdapter.js')).runWorkdayAdapter;
    case 'smartrecruiters':
      return (await import('./adapters/smartRecruitersAdapter.js')).runSmartRecruitersAdapter;
    default:
      // iCIMS, Taleo, Jobvite, Ashby, Rippling, unknown → AI-powered generic
      return (await import('./adapters/genericAdapter.js')).runGenericAdapter;
  }
}

// ── Page loader with fallback ────────────────────────────────────────────────

async function navigateToForm(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 35000 });
  } catch {
    // networkidle timeout is normal for slow/SPA pages
    try {
      await page.waitForTimeout(4000);
    } catch {}
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Open a browser, navigate to the job application URL, and auto-fill all
 * form fields using the appropriate platform adapter.
 *
 * @param {string}  jobUrl     — The canonical job listing URL (used for platform detection)
 * @param {string}  [applyUrl] — Direct application URL (overrides auto-derived apply URL)
 * @param {object}  profile    — User profile from ProfileManager.loadProfile()
 * @param {string}  [jobContext] — Job title + description (used to generate cover letter)
 * @returns {Promise<object>}
 */
export async function autoFillApplication(jobUrl, applyUrl, profile, jobContext = '') {
  const platform   = detectPlatform(jobUrl || applyUrl || '');
  const targetUrl  = applyUrl || getApplyUrl(jobUrl, platform);

  console.log(`  [AutoFill] Platform detected: ${PLATFORM_DISPLAY_NAMES[platform] || platform}`);
  console.log(`  [AutoFill] Generating AI cover letter + summary...`);

  // Build field values BEFORE opening browser (so cover letter gen doesn't block UI)
  const fieldValues = await buildFieldValues(profile, jobContext, { generateAIContent: true });

  if (fieldValues.resumePath) {
    console.log(`  [AutoFill] Resume found: ${fieldValues.resumePath.split(/[\\/]/).pop()}`);
  } else {
    console.log(`  [AutoFill] No resume PDF found — upload will be skipped.`);
  }

  // Launch browser
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    // Pretend to be a regular Chrome user to avoid bot detection
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await navigateToForm(page, targetUrl);

  // Run the appropriate adapter
  const adapter = await getAdapter(platform);
  const adapterResult = await adapter(page, fieldValues);

  return {
    browser,
    page,
    platform,
    platformName: PLATFORM_DISPLAY_NAMES[platform] || platform,
    targetUrl,
    filled:        adapterResult.filled       || [],
    skipped:       adapterResult.skipped      || [],
    uploaded:      adapterResult.uploaded     || false,
    aiMappingUsed: adapterResult.aiMappingUsed || false,
    fieldValues,
  };
}

// ── Re-export helpers for tests ───────────────────────────────────────────────
export { detectPlatform, getApplyUrl, PLATFORM_DISPLAY_NAMES } from './platformDetector.js';
export { buildFieldValues, findLatestResumePdf } from './profileMapper.js';
