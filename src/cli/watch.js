#!/usr/bin/env node
/**
 * watch.js — periodic scan + desktop notification (plan §5.1/§8 Phase 6).
 *
 * Usage:
 *   node hunt-job.js watch --archetype "DevOps Engineer" [--interval 30] [--once]
 *
 * Loops scanAll() every `--interval` minutes (default 30, min 10), prints a
 * highlighted table of new matches, and fires a Windows toast notification
 * (falls back to terminal bell + log on any failure, or on non-Windows).
 * `--once` runs a single cycle and exits — useful for cron/Task Scheduler.
 */
import chalk from 'chalk';
import { spawn } from 'child_process';
import { scanAll } from '../core/scan/index.js';
import { closeDb } from '../core/db.js';
import { createLogger } from '../core/logger.js';
import { daysAgoLabel } from '../core/scan/normalize.js';

const log = createLogger('cli.watch');
const MIN_INTERVAL_MIN = 10;
const DEFAULT_INTERVAL_MIN = 30;

function parseArgs(argv) {
  const args = { interval: DEFAULT_INTERVAL_MIN, once: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--archetype') args.archetype = argv[++i];
    else if (a === '--interval') args.interval = Number(argv[++i]);
    else if (a === '--once') args.once = true;
  }
  return args;
}

function bellAndLog(title, body) {
  process.stdout.write('\x07');
  console.log(chalk.bold.cyan(`\n🔔 ${title}`) + '\n' + chalk.white(body) + '\n');
}

// ponytail: WinRT toast via a spawned PowerShell one-liner — no node-notifier
// dependency for a feature this small. Any failure (non-Windows, PowerShell
// missing, WinRT unavailable) falls back to bell + console log.
function notify(title, body) {
  if (process.platform !== 'win32') {
    bellAndLog(title, body);
    return;
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const xml = `<toast><visual><binding template="ToastGeneric"><text>${esc(title)}</text><text>${esc(body)}</text></binding></visual></toast>`;
  const psScript = [
    '$ErrorActionPreference = "Stop"',
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null',
    '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
    `$xml.LoadXml('${xml.replace(/'/g, "''")}')`,
    '$toast = New-Object Windows.UI.Notifications.ToastNotification $xml',
    '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Hunt-Job").Show($toast)',
  ].join('; ');

  let done = false;
  const finish = ok => { if (!done) { done = true; if (!ok) bellAndLog(title, body); } };

  try {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { stdio: 'ignore' });
    child.on('error', () => finish(false));
    child.on('close', code => finish(code === 0));
  } catch {
    finish(false);
  }

  // Always echo to the terminal too — the toast is a supplement, not a replacement.
  console.log(chalk.bold.cyan(`\n🔔 ${title}`) + '\n' + chalk.white(body) + '\n');
}

function printNewJobsTable(newJobs) {
  console.log(chalk.bgGreen.black.bold(`\n  ${newJobs.length} NEW MATCH${newJobs.length === 1 ? '' : 'ES'}  `));
  newJobs.forEach((j, i) => {
    const age = daysAgoLabel(j.postedAt);
    console.log(
      chalk.green.bold(`\n  ${i + 1}. ${j.title}`) +
      chalk.gray('  —  ') + chalk.white(j.company) +
      (age ? chalk.gray(`  (${age})`) : '')
    );
    console.log(chalk.gray(`     ${j.location || 'India'}`));
    if (j.url) console.log(chalk.blue.underline(`     ${j.url}`));
  });
  console.log();
}

async function runCycle(archetype) {
  const startedAt = new Date().toISOString();
  log.op('watch_cycle_start', { archetype });
  try {
    const { jobs, newJobs, closed, errors } = await scanAll(archetype);
    console.log(chalk.gray(
      `[${startedAt}] scanned: ${jobs.length} matching · ${newJobs.length} new · ${closed} closed · ${errors.length} errors`
    ));
    if (errors.length) {
      errors.slice(0, 5).forEach(e => console.log(chalk.yellow(`  ⚠ ${e.company}: ${e.error}`)));
    }
    if (newJobs.length) {
      printNewJobsTable(newJobs);
      notify(
        `Hunt-Job: ${newJobs.length} new "${archetype}" role${newJobs.length === 1 ? '' : 's'}`,
        newJobs.slice(0, 3).map(j => `${j.title} @ ${j.company}`).join('\n')
      );
    }
    log.op('watch_cycle_done', { archetype, total: jobs.length, new: newJobs.length, closed, errors: errors.length });
    return { jobs, newJobs, closed, errors };
  } catch (e) {
    console.error(chalk.red(`[${startedAt}] scan failed: ${e.message}`));
    log.error('watch_cycle_failed', { archetype, error: e.message });
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.archetype) {
    console.error('Usage: node hunt-job.js watch --archetype "<role>" [--interval <minutes>] [--once]');
    process.exit(1);
  }
  const intervalMin = Math.max(MIN_INTERVAL_MIN, Number.isFinite(args.interval) ? args.interval : DEFAULT_INTERVAL_MIN);

  console.log(chalk.cyan.bold(
    `\nWatching for "${args.archetype}" roles every ${intervalMin}m.` + (args.once ? '' : ' Ctrl+C to stop.') + '\n'
  ));

  const result = await runCycle(args.archetype);

  if (args.once) {
    closeDb();
    process.exitCode = result ? 0 : 1;
    return;
  }

  let stopped = false;
  process.on('SIGINT', () => {
    if (stopped) return;
    stopped = true;
    console.log(chalk.yellow('\n\nStopping watch. Bye!\n'));
    closeDb();
    process.exit(0);
  });

  while (!stopped) {
    await new Promise(r => setTimeout(r, intervalMin * 60 * 1000));
    if (stopped) break;
    await runCycle(args.archetype);
  }
}

main();
