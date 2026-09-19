#!/usr/bin/env node
// `hunt-job eval-models` — docs/fable51-answers.md §3.5.
//
// Runs extraction (src/core/scoring/extract.js) against the fixtures in
// test/fixtures/scoring/ across every configured provider, and reports
// per-provider agreement against each fixture's hand-checked gold
// extraction. Makes real LLM calls — the `priorityOrder` in settings.json
// should be set from this report, not from taste (§3.5).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ProfileManager from '../core/profileManager.js';
import { evalProviderOnFixtures, summarizeProviderResults } from '../core/scoring/evalModels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../test/fixtures/scoring');
const PROVIDERS = ['anthropic', 'openrouter', 'groq', 'nvidia', 'gemini'];

function loadFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf-8')));
}

async function main() {
  const fixtures = loadFixtures();
  if (!fixtures.length) {
    console.error(chalk.red(`No fixtures found in ${FIXTURES_DIR}`));
    process.exit(1);
  }

  const profileManager = new ProfileManager();
  const profile = (await profileManager.loadProfile()) || {};

  console.log(chalk.cyan.bold(`\nRunning extraction on ${fixtures.length} fixture(s) across ${PROVIDERS.length} provider(s)...`));
  console.log(chalk.yellow('This makes real LLM calls and spends provider quota.\n'));

  for (const providerName of PROVIDERS) {
    const results = await evalProviderOnFixtures(providerName, fixtures, { profile });
    const summary = summarizeProviderResults(results);

    console.log(chalk.bold(providerName));
    if (!summary.ok) {
      console.log(chalk.red(`  all ${summary.total} fixture(s) failed (no key, or a provider error)`));
      const firstError = results.find(r => !r.ok)?.error;
      if (firstError) console.log(chalk.gray(`  ${firstError.slice(0, 120)}`));
      continue;
    }
    console.log(`  fixtures ok:         ${summary.ok}/${summary.total}`);
    if (summary.avgSkillF1 != null) console.log(`  must-have skill F1:  ${(summary.avgSkillF1 * 100).toFixed(0)}%`);
    if (summary.avgEnumAccuracy != null) console.log(`  enum field accuracy: ${(summary.avgEnumAccuracy * 100).toFixed(0)}%`);
  }
  console.log();
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
