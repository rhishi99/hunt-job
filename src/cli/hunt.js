#!/usr/bin/env node
/**
 * Hunt-Job Single-Command Workflow
 * Usage: node hunt-job.js hunt --archetype "Data Engineer" [--limit 5]
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../data');

async function runScript(scriptPath, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...scriptArgs], {
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Script exited with code ${code}`));
      resolve();
    });
    child.on('error', reject);
  });
}

async function scanPortals(archetype, limit = 20) {
  console.log(`\n🔍 Scanning for "${archetype}" roles...\n`);
  await runScript('src/cli/scanPortals.js', ['--archetype', archetype, '--limit', limit.toString()]);
}

async function evaluateJobs() {
  console.log(`\n📊 Evaluating scanned jobs...\n`);
  // Jobs are already evaluated during scan - this step processes results
}

async function generateResume(jobId) {
  console.log(`\n📝 Generating resume for ${jobId}...\n`);
  await runScript('src/cli/generateResume.js', [jobId]);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === 'hunt') {
    let archetype = 'Software Engineer';
    let limit = 10;
    
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--archetype' && args[i + 1]) {
        archetype = args[i + 1];
        i++;
      } else if (args[i] === '--limit' && args[i + 1]) {
        limit = parseInt(args[i + 1]);
        i++;
      }
    }
    
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           🎯 HUNT-JOB Single-Command Workflow            ║
╠═══════════════════════════════════════════════════════════╣
║  Archetype: ${archetype}
║  Limit: ${limit}
╚═══════════════════════════════════════════════════════════╝
    `);
    
    if (!fs.existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    await scanPortals(archetype, limit);
    
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    ✅ Scan Complete                    ║
╠═══════════════════════════════════════════════════════════╣
║  Jobs saved to: data/evaluated-jobs.json              ║
║                                                             ║
║  Next steps:                                              ║
║    • Review scores: node hunt-job.js evaluate <url>       ║
║    • Generate resume: node hunt-job.js resume <job-id>     ║
║    • Prep for interview: node hunt-job.js prep <desc>    ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } else {
    console.log(`
Hunt-Job — Single-Command Workflow

Usage:
  node hunt-job.js hunt --archetype "Data Engineer" [--limit 10]

Options:
  --archetype   Target job role (default: "Software Engineer")
  --limit      Number of jobs to scan (default: 10)

Examples:
  node hunt-job.js hunt --archetype "Backend Engineer"
  node hunt-job.js hunt --archetype "ML Engineer" --limit 20
    `);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});