#!/usr/bin/env node
/**
 * Hunt-Job Launcher
 * Cross-platform entry point (Windows, macOS, Linux)
 *
 * Usage:
 *   node hunt-job.js                    # Interactive menu
 *   node hunt-job.js evaluate <url>     # Evaluate job
 *   node hunt-job.js scan --archetype "Backend Engineer"
 *   node hunt-job.js resume <job_id>
 *   node hunt-job.js prep <job_description>
 *   node hunt-job.js setup              # Setup API key
 *   node hunt-job.js profile init       # Initialize profile
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

// Load .env if present
if (existsSync('.env')) {
    dotenv.config();
}

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

/**
 * Run a Node CLI script
 */
function runScript(scriptPath, scriptArgs = []) {
    return new Promise((resolve, reject) => {
        // shell: true would re-parse args on Windows and strip quoting from
        // multi-word values like --archetype "DevOps Engineer"
        const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
            stdio: 'inherit',
        });

        child.on('close', (code) => {
            if (code !== 0) reject(new Error(`Script exited with code ${code}`));
            resolve();
        });

        child.on('error', reject);
    });
}

/**
 * Main entry point
 */
async function main() {
    try {
        switch (command) {
            case 'evaluate':
                await runScript('src/cli/evaluateJob.js', args.slice(1));
                break;
            case 'scan':
                await runScript('src/cli/scanPortals.js', args.slice(1));
                break;
            case 'list':
            case 'jobs':
            case 'browse':
                await runScript('src/cli/listJobs.js', args.slice(1));
                break;
            case 'audit-portals':
            case 'audit':
                await runScript('src/cli/auditPortals.js', args.slice(1));
                break;
            case 'resume':
                await runScript('src/cli/generateResume.js', args.slice(1));
                break;
            case 'apply':
                await runScript('src/cli/applyJob.js', args.slice(1));
                break;
            case 'prep':
                await runScript('src/cli/prepareInterview.js', args.slice(1));
                break;
            case 'setup':
                await runScript('src/cli/setupApiKey.js');
                break;
            case 'parse-resume':
            case 'parse':
                await runScript('src/cli/parseResume.js', args.slice(1));
                break;
            case 'profile': {
                const subcommand = args[1]?.toLowerCase();
                if (subcommand === 'init') {
                    await runScript('src/cli/profileInit.js');
                } else if (subcommand === 'edit') {
                    await runScript('src/cli/profileEdit.js');
                } else {
                    await runScript('src/cli/profileEdit.js');
                }
                break;
            }
            case 'start':
            case 'interactive':
                await runScript('src/cli/interactive.js');
                break;
            case 'hunt':
                await runScript('src/cli/hunt.js', args.slice(1));
                break;
            case 'watch':
                await runScript('src/cli/watch.js', args.slice(1));
                break;
            case 'dashboard': {
                const port = process.env.HUNT_JOB_PORT || 7777;
                console.log(`\nStarting Hunt-Job dashboard at http://127.0.0.1:${port} ...\n`);
                await runScript('src/web/server.js');
                break;
            }
            case 'detect': {
                const url = args[1];
                if (!url) {
                    console.error('Usage: node hunt-job.js detect <careers-url>');
                    process.exit(1);
                }
                const { detect } = await import('./src/core/scan/detect.js');
                const result = await detect(url);
                console.log(`\nPlatform: ${result.platform || 'unknown'}`);
                console.log(`Token:    ${result.token || '-'}`);
                console.log(`Method:   ${result.method}\n`);
                break;
            }
            case '--help':
            case '-h':
            case 'help':
                console.log(`
Hunt-Job — AI Job Search Agent

USAGE:
  node hunt-job.js [COMMAND] [OPTIONS]

COMMANDS:
  hunt --archetype <name>      Single-command full workflow
  evaluate <url>              Evaluate a job posting
  scan --archetype <name>     LIVE scan of company ATS boards (populates the DB)
  list [filters]              INSTANT browse of already-scanned jobs (no network)
  watch --archetype <name>    Periodic scan + desktop notification on new matches
                                 [--interval <minutes>] (default 30, min 10) [--once]
  detect <careers-url>        Detect a company's ATS platform from its careers URL
  audit-portals               Re-verify/re-detect the whole company registry
  dashboard                   Start the local web dashboard (http://127.0.0.1:7777)
  resume <job-id>             Generate tailored resume
  apply <job-url>             Open the AI auto-fill apply flow for a job URL
  prep <description|file>     Generate interview prep guide
  profile init                Initialize your profile
  profile edit                Edit your profile
  setup                       Setup API keys
  parse-resume <path>         Parse resume PDF
  start, interactive          Start interactive menu
  help, --help, -h            Show this help

FILTERS (scan + list):  -a/--archetype  -s/--since <days>  --new  --new-hours <h>
  -n/--limit <n>  -c/--company <t>  -l/--location <t>  --remote  --all  -p/--platform  --json

EXAMPLES:
  node hunt-job.js scan --archetype "Backend Engineer" --since 14 --limit 20
  node hunt-job.js list --archetype "DevOps Engineer" --new          # instant, offline
  node hunt-job.js list -a "Data Engineer" --remote --json
  node hunt-job.js watch --archetype "DevOps Engineer" --interval 30
  node hunt-job.js evaluate "https://careers.google.com/..."
            `);
                break;
            default:
                await runScript('src/cli/interactive.js');
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
