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
import * as readline from 'readline';
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

/**
 * Show interactive menu
 */
async function showMenu() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (prompt) =>
        new Promise((resolve) => rl.question(prompt, resolve));

    // Check if we're on Windows (cmd.exe doesn't handle Unicode well)
    const isWindowsCmd =
        process.platform === 'win32' && !process.env.WT_SESSION;
    const useUnicode = !isWindowsCmd;

    console.clear?.() || console.log('\x1Bc');
    console.log('');
    if (useUnicode) {
        console.log('  ╔══════════════════════════════════════════╗');
        console.log('  ║   🎯  CAREER-OPS  —  Job Search Agent    ║');
        console.log('  ╚══════════════════════════════════════════╝');
    } else {
        console.log('  ========================================');
        console.log('    HUNT-JOB - Job Search Agent');
        console.log('  ========================================');
    }
    console.log('');
    if (useUnicode) {
        console.log('  ── Job Search ─────────────────────────────');
    } else {
        console.log('  -- Job Search --------------------------');
    }
    console.log('   [1]  Full Interactive Menu  (recommended)');
    console.log('   [2]  Evaluate a Job');
    console.log('   [3]  Scan Job Portals');
    console.log('   [4]  Generate Resume');
    console.log('   [5]  Interview Prep');
    console.log('');
    if (useUnicode) {
        console.log('  ── Profile ────────────────────────────────');
    } else {
        console.log('  -- Profile ----------------------------');
    }
    console.log('   [6]  Setup API Keys');
    console.log('   [7]  Initialize Profile');
    console.log('   [8]  Edit Profile');
    console.log('   [9]  Parse Resume PDF  (build profile from PDF)');
    console.log('');
    console.log('   [0]  Exit');
    console.log('');

    const choice = await question('  Enter your choice: ');
    rl.close();

    try {
        switch (choice) {
            case '1':
                await runScript('src/cli/interactive.js');
                break;
            case '2': {
                const input = await question(
                    '  Paste job URL or description: '
                );
                await runScript('src/cli/evaluateJob.js', [input]);
                break;
            }
            case '3': {
                const archetype = await question(
                    '  Target archetype (e.g. Backend Engineer): '
                );
                await runScript('src/cli/scanPortals.js', [
                    '--archetype',
                    archetype,
                ]);
                break;
            }
            case '4': {
                const jobId = await question('  Job ID from evaluation: ');
                await runScript('src/cli/generateResume.js', [jobId]);
                break;
            }
            case '5': {
                const prep = await question(
                    '  Job description text or path to .txt file: '
                );
                await runScript('src/cli/prepareInterview.js', [prep]);
                break;
            }
            case '6':
                await runScript('src/cli/setupApiKey.js');
                break;
            case '7':
                await runScript('src/cli/profileInit.js');
                break;
            case '8':
                await runScript('src/cli/profileEdit.js');
                break;
            case '9': {
                const pdf = await question('  Path to resume PDF: ');
                await runScript('src/cli/parseResume.js', [pdf]);
                break;
            }
            case '0':
                process.exit(0);
            default:
                console.log('Invalid choice');
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
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
            case 'resume':
                await runScript('src/cli/generateResume.js', args.slice(1));
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
  scan --archetype <name>     Scan job portals for matches
  resume <job-id>             Generate tailored resume
  prep <description|file>     Generate interview prep guide
  profile init                Initialize your profile
  profile edit                Edit your profile
  setup                       Setup API keys
  parse-resume <path>         Parse resume PDF
  start, interactive          Start interactive menu
  help, --help, -h            Show this help

EXAMPLES:
  node hunt-job.js hunt --archetype "Data Engineer"
  node hunt-job.js hunt --archetype "Backend Engineer" --limit 20
  node hunt-job.js evaluate "https://careers.google.com/..."
  node hunt-job.js scan --archetype "Backend Engineer"
  node hunt-job.js prep job_description.txt
            `);
                break;
            default:
                await showMenu();
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
