#!/usr/bin/env node
/**
 * Hunt-Job E2E Standalone Smoke Test Suite (Node.js Playwright)
 * Tests core UI flows: Dashboard Stats, Pipeline Kanban, Jobs Table & Filters,
 * Evaluations View, Candidate Profile View, and Detail Modal.
 *
 * Runs directly with Node and the repo's installed `playwright` dependency.
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://127.0.0.1:7777';
const TIMEOUT = 15000;

const testResults = {
  timestamp: new Date().toISOString(),
  base_url: BASE_URL,
  tests: {},
  console_errors: [],
  console_warnings: []
};

function isServerRunning(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/stats`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function testTopbarAndStats(page) {
  console.log('\n--- Test 1: Top bar and KPI Stats ---');
  const startTime = Date.now();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForSelector('.brand', { timeout: TIMEOUT });

  const brandText = await page.innerText('.brand');
  console.log(` [✓] Brand text found: ${brandText.trim().replace(/\s+/g, ' ')}`);

  // Wait for initial stats fetch & counter animation to settle
  await page.waitForTimeout(600);
  await page.waitForSelector('.stat .value', { timeout: TIMEOUT });
  const stats = await page.$$('.stat');
  const statValues = [];

  for (const s of stats) {
    const labelEl = await s.$('.label');
    const valEl = await s.$('.value');
    if (labelEl && valEl) {
      const lbl = (await labelEl.innerText()).trim();
      const val = (await valEl.innerText()).trim();
      statValues.push(`${lbl}: ${val}`);
    }
  }

  console.log(` [✓] KPI Stats loaded (${statValues.length} metrics): ${statValues.join(', ')}`);

  const passed = stats.length >= 4 && brandText.length > 0;
  testResults.tests.topbar_and_stats = {
    status: passed ? 'PASS' : 'FAIL',
    duration_ms: Date.now() - startTime,
    metrics_count: stats.length,
    brand: brandText.trim().replace(/\s+/g, ' ')
  };
  return passed;
}

async function testPipelineKanban(page) {
  console.log('\n--- Test 2: Pipeline Kanban Board ---');
  const startTime = Date.now();

  const pipelineView = await page.$('#view-pipeline');
  const isVisible = await pipelineView.isVisible();
  if (!isVisible) {
    await page.click('a[data-view="pipeline"]');
    await page.waitForSelector('#view-pipeline.active', { timeout: TIMEOUT });
  }

  await page.waitForSelector('#kanban-board', { timeout: TIMEOUT });
  const columns = await page.$$('#kanban-board .column');
  console.log(` [✓] Kanban Board rendered with ${columns.length} columns.`);

  const passed = columns.length >= 4;
  testResults.tests.pipeline_kanban = {
    status: passed ? 'PASS' : 'FAIL',
    duration_ms: Date.now() - startTime,
    columns_count: columns.length
  };
  return passed;
}

async function testJobsTableAndSearch(page) {
  console.log('\n--- Test 3: Jobs Table & Search Filters ---');
  const startTime = Date.now();

  await page.click('a[data-view="jobs"]');
  await page.waitForSelector('#view-jobs.active', { timeout: TIMEOUT });

  await page.waitForSelector('#jobs-table tbody tr', { timeout: TIMEOUT });
  const initialRows = await page.$$('#jobs-table tbody tr');
  console.log(` [✓] Jobs table rendered with ${initialRows.length} visible rows.`);

  const searchInput = await page.$('#jobs-search');
  if (searchInput && initialRows.length > 0) {
    const firstCompanyCell = await page.$('#jobs-table tbody tr td:first-child');
    if (firstCompanyCell) {
      const compText = (await firstCompanyCell.innerText()).trim();
      const term = compText.slice(0, 4);
      console.log(` [✓] Filtering by company search term: '${term}'`);
      await searchInput.fill(term);
      await page.waitForTimeout(200);

      const filteredRows = await page.$$('#jobs-table tbody tr');
      console.log(` [✓] Filter applied: ${filteredRows.length} rows matching.`);

      await searchInput.fill('');
      await page.waitForTimeout(200);
    }
  }

  const passed = initialRows.length > 0;
  testResults.tests.jobs_table_and_search = {
    status: passed ? 'PASS' : 'FAIL',
    duration_ms: Date.now() - startTime,
    initial_rows_count: initialRows.length
  };
  return passed;
}

async function testEvaluationsAndProfile(page) {
  console.log('\n--- Test 4: Evaluations & Candidate Profile Views ---');
  const startTime = Date.now();

  await page.click('a[data-view="evaluations"]');
  await page.waitForSelector('#view-evaluations.active', { timeout: TIMEOUT });
  await page.waitForSelector('#evaluations-list', { timeout: TIMEOUT });
  console.log(' [✓] Evaluations view loaded successfully.');

  await page.click('a[data-view="profile"]');
  await page.waitForSelector('#view-profile.active', { timeout: TIMEOUT });
  await page.waitForSelector('#profile-card', { timeout: TIMEOUT });
  const profileText = await page.innerText('#profile-card');
  console.log(` [✓] Candidate Profile card rendered (${profileText.length} chars).`);

  const passed = profileText.length > 0;
  testResults.tests.evaluations_and_profile = {
    status: passed ? 'PASS' : 'FAIL',
    duration_ms: Date.now() - startTime
  };
  return passed;
}

async function testModalInteractions(page) {
  console.log('\n--- Test 5: Job Detail Modal Interaction ---');
  const startTime = Date.now();

  await page.click('a[data-view="jobs"]');
  await page.waitForSelector('#view-jobs.active', { timeout: TIMEOUT });

  const firstRow = await page.$('#jobs-table tbody tr');
  let modalOpened = false;
  if (firstRow) {
    await firstRow.click();
    await page.waitForSelector('#detail-modal.active', { timeout: TIMEOUT });
    const modalTitle = await page.innerText('#modal-title');
    console.log(` [✓] Modal opened with title: ${modalTitle.trim()}`);

    const closeBtn = await page.$('#detail-modal .close-btn');
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(200);
      const isActive = await page.isVisible('#detail-modal.active');
      console.log(` [✓] Modal closed successfully (active=${isActive}).`);
      modalOpened = !isActive;
    }
  }

  testResults.tests.modal_interaction = {
    status: modalOpened ? 'PASS' : 'FAIL',
    duration_ms: Date.now() - startTime
  };
  return modalOpened;
}

async function runAllTests() {
  console.log('================================================================');
  console.log(' 🏹 Starting Hunt-Job Browser E2E Standalone Smoke Test Suite');
  console.log('================================================================');

  let serverProcess = null;
  const running = await isServerRunning(BASE_URL);
  if (!running) {
    console.log(` [*] Web server not running on ${BASE_URL}. Launching background server...`);
    serverProcess = spawn('node', ['src/web/server.js'], {
      cwd: __dirname,
      stdio: 'ignore',
      detached: false
    });

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await isServerRunning(BASE_URL)) {
        console.log(' [✓] Background web server started successfully.');
        break;
      }
    }
  }

  let allPassed = false;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type === 'error') testResults.console_errors.push(msg.text());
      else if (msg.type === 'warning') testResults.console_warnings.push(msg.text());
    });

    const t1 = await testTopbarAndStats(page);
    const t2 = await testPipelineKanban(page);
    const t3 = await testJobsTableAndSearch(page);
    const t4 = await testEvaluationsAndProfile(page);
    const t5 = await testModalInteractions(page);

    allPassed = t1 && t2 && t3 && t4 && t5;
  } catch (err) {
    console.error(`\n [✗] Test suite exception: ${err.message}`);
    testResults.error = err.message;
    allPassed = false;
  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
      console.log(' [*] Shutting down background test web server...');
      serverProcess.kill();
    }
  }

  testResults.summary = {
    all_passed: allPassed,
    total_tests: Object.keys(testResults.tests).length,
    passed_tests: Object.values(testResults.tests).filter((t) => t.status === 'PASS').length
  };

  const resultsPath = path.join(__dirname, 'TEST_RESULTS.json');
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2), 'utf-8');

  console.log('\n================================================================');
  if (allPassed) {
    console.log(' 🎉 ALL BROWSER E2E TESTS PASSED!');
  } else {
    console.log(' ⚠️ SOME BROWSER E2E TESTS FAILED!');
  }
  console.log(` Report written to: ${resultsPath}`);
  console.log('================================================================\n');

  process.exit(allPassed ? 0 : 1);
}

runAllTests();
