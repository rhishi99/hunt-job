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

// ── Post-fill audit (B-16) ────────────────────────────────────────────────────

/**
 * Read-only scan for required, visible, still-empty form controls. Never
 * clicks, types into, or submits anything. Returns human labels; never throws.
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>}
 */
export async function auditRequiredFields(page) {
  try {
    const found = await page.evaluate(() => {
      const label = el => {
        const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        const txt = (id && id.textContent) || el.getAttribute('aria-label') ||
          (el.closest('label') && el.closest('label').textContent) || el.placeholder ||
          el.name || el.id || el.tagName.toLowerCase();
        return String(txt).replace(/\s+/g, ' ').replace(/\*/g, '').trim().slice(0, 80);
      };
      const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const out = [];
      const radios = new Set();
      document.querySelectorAll('input, select, textarea').forEach(el => {
        const t = (el.type || '').toLowerCase();
        if (['hidden', 'submit', 'button', 'image', 'reset'].includes(t) || el.disabled) return;
        const required = el.required || el.getAttribute('aria-required') === 'true';
        if (!required || !visible(el)) return;
        if (t === 'radio') {
          if (radios.has(el.name)) return;
          radios.add(el.name);
          if (document.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`)) return;
        } else if (t === 'checkbox') {
          if (el.checked) return;
        } else if (t === 'file') {
          if (el.files && el.files.length) return;
        } else if (el.value && String(el.value).trim()) {
          return;
        }
        out.push(label(el));
      });
      return out;
    });
    return Array.isArray(found) ? found : [];
  } catch {
    return [];
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
 * @param {{jobId?: string|null}} [opts] — jobId locates THIS job's résumé PDF in `documents` (B-03)
 * @returns {Promise<object>}
 */
export async function autoFillApplication(jobUrl, applyUrl, profile, jobContext = '', opts = {}) {
  const platform   = detectPlatform(jobUrl || applyUrl || '');
  const targetUrl  = applyUrl || getApplyUrl(jobUrl, platform);

  console.log(`  [AutoFill] Platform detected: ${PLATFORM_DISPLAY_NAMES[platform] || platform}`);
  console.log(`  [AutoFill] Generating AI cover letter + summary...`);

  // Build field values BEFORE opening browser (so cover letter gen doesn't block UI)
  const fieldValues = await buildFieldValues(profile, jobContext, {
    generateAIContent: true,
    jobId: opts.jobId || null,
    jobUrl: jobUrl || applyUrl || null,
    resumePath: opts.resumePath || null,
  });

  if (fieldValues.resumePath) {
    console.log(`  [AutoFill] Resume found: ${fieldValues.resumePath.split(/[\\/]/).pop()}`);
  } else {
    console.log(`  [AutoFill] WARNING: no résumé PDF generated for THIS job — upload skipped (generate one first; not guessing a different job's file).`);
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

  // B-16: shared audit — which required fields are still empty after the adapter ran
  const emptyRequired = await auditRequiredFields(page);
  if (emptyRequired.length) {
    console.log(`  [AutoFill] ${emptyRequired.length} required field(s) still empty — fill before submitting:`);
    emptyRequired.forEach(f => console.log(`    - ${f}`));
  }

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
    emptyRequired,
    fieldValues,
  };
}

// ── Re-export helpers for tests ───────────────────────────────────────────────
export { detectPlatform, getApplyUrl, PLATFORM_DISPLAY_NAMES } from './platformDetector.js';
export { buildFieldValues, findJobResumePdf } from './profileMapper.js';
