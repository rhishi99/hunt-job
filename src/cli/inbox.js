#!/usr/bin/env node
/**
 * inbox.js — `hunt-job inbox [--since 14d] [--dry-run] [--purge <days>]`
 * docs/fable51-answers.md §5 (T7). Read-only IMAP capture of application
 * outcomes; see src/core/inbox/index.js. Missing credentials are not an
 * error: prints setup steps and exits 0.
 */
import 'dotenv/config';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from '../core/db.js';
import { processInbox, parseSince, purgeResolved } from '../core/inbox/index.js';
import { createImapSource, readCredentials, SETUP_STEPS } from '../core/inbox/imapSource.js';

export function parseArgs(argv) {
  const args = { since: null, dryRun: false, purge: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since' || a === '-s') args.since = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--purge') args.purge = Number(argv[++i]);
  }
  return args;
}

function line(r) {
  const to = r.to ? ` -> ${r.to}` : '';
  const when = r.interviewAt ? ` @ ${new Date(r.interviewAt).toISOString()}` : '';
  return `  ${r.outcome}${to}${when} [${(r.confidence * 100).toFixed(0)}%] ${r.domain} "${r.subject}"${r.jobId ? ` job=${r.jobId}` : ''} (${r.reason})`;
}

export async function runInboxCli(argv, { db = getDb(), source, env = process.env, out = console.log } = {}) {
  const args = parseArgs(argv);
  if (args.purge != null && Number.isFinite(args.purge)) {
    out(`Purged ${purgeResolved(db, args.purge)} resolved inbox rows older than ${args.purge}d.`);
    return { purged: true };
  }
  if (!source) {
    const creds = readCredentials(env);
    if (!creds) { SETUP_STEPS.forEach(l => out(l)); return { configured: false }; }
    source = createImapSource(creds);
  }
  const sinceMs = args.since ? parseSince(args.since) : null;
  if (args.since && sinceMs == null) { out(`Bad --since "${args.since}" (use e.g. 14d, 2w, 36h).`); return { configured: true, error: 'bad since' }; }

  const s = await processInbox({ db, source, sinceMs, dryRun: args.dryRun });
  out(`inbox${s.dryRun ? ' (dry-run, nothing written)' : ''}: ${s.seen} fetched · ${s.applied.length} ${s.dryRun ? 'would apply' : 'applied'} · ${s.review.length} need review · ${s.noop} no-op · ${s.skipped} skipped`);
  if (s.applied.length) { out('Applied:'); s.applied.forEach(r => out(line(r))); }
  if (s.review.length) { out('Needs review:'); s.review.forEach(r => out(line(r))); }
  return { configured: true, ...s };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runInboxCli(process.argv.slice(2))
    .then(() => closeDb())
    .catch(err => {
      console.error(chalk.red('Error:'), err.message);
      process.exit(1);
    });
}
