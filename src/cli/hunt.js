#!/usr/bin/env node
/**
 * hunt.js — `hunt-job hunt`: thin single-archetype alias for `run` (B-19).
 *
 * This used to be its own scan-then-stop workflow: its "evaluate" step was a
 * no-op (`evaluateJobs()` printed a banner and did nothing) and its
 * completion banner pointed at `data/evaluated-jobs.json`, a file nothing
 * ever wrote — despite AGENTS.md advertising `hunt` as "scan + evaluate"
 * (backlog B-19). It was also unreachable as documented: invoked through the
 * dispatcher (`hunt-job.js` spawns this with the leading "hunt" word already
 * stripped from argv), so its own `if (args[0] === 'hunt')` check was always
 * false and it silently fell through to a usage message instead of scanning.
 *
 * docs/fable51-answers.md §1.6 calls for deleting the broken workflow rather
 * than patching it, once `run` exists to actually do the work: `hunt
 * --archetype X` is now exactly `run --once --archetype X` — a real
 * scan -> prefilter -> evaluate -> digest pass.
 *
 * `--limit` is accepted for backward compatibility (existing callers pass
 * it) but no longer does anything: `run` is bounded by the daily LLM budget
 * (settings.json `budget.daily`), not by a scan-result count.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = { archetype: 'Software Engineer' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--archetype' && argv[i + 1]) args.archetype = argv[++i];
    else if (argv[i] === '--limit' && argv[i + 1]) i++; // accepted, ignored — see file header
  }
  return args;
}

function runScript(scriptPath, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], { stdio: 'inherit' });
    child.on('close', code => (code !== 0 ? reject(new Error(`Script exited with code ${code}`)) : resolve()));
    child.on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`\nHunt-Job — single-archetype run: "${args.archetype}"\n`);
  await runScript(path.join(__dirname, 'run.js'), ['--once', '--archetype', args.archetype]);
  console.log('\nDone — see data/digest/<date>.md for scored results and next steps.\n');
}

// Guarded so `parseArgs` can be imported by tests without spawning run.js.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
