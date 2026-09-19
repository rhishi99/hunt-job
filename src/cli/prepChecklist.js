#!/usr/bin/env node
// `hunt-job prep <jobId>` / `prep --plan` — T5 checklist (docs/fable51-answers.md §7).
//   prep <jobId>                       derive + list that job's topics
//   prep <jobId> --tick <topic>        cycle status todo -> practicing -> confident
//   prep <jobId> --set <topic> <status> [--rating 1-3]
//   prep --plan                        write data/prep/plan.md (top 10 by weight)
import { pathToFileURL } from 'node:url';
import { getDb } from '../core/db.js';
import { deriveTopics, listTopics, resolveTopic, setProgress, writePlan, STATUSES } from '../core/prepTopics.js';

const flagVal = (a, f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };

export async function runPrep(argv, { db = getDb(), loadProfile, log = console.log } = {}) {
  const profile = loadProfile ? await loadProfile() : null;
  if (profile) deriveTopics(db, profile);

  if (argv.includes('--plan')) {
    log(`Wrote ${writePlan(db)}`);
    return 0;
  }
  const jobId = argv.find(a => !a.startsWith('--'));
  const tick = flagVal(argv, '--tick');
  const set = argv.indexOf('--set');
  const rating = flagVal(argv, '--rating');

  if (tick || set >= 0) {
    const raw = tick ?? argv[set + 1];
    const key = resolveTopic(db, raw);
    if (!key) { log(`Unknown topic: ${raw}`); return 1; }
    let status = set >= 0 ? argv[set + 2] : undefined;
    if (tick) {
      const cur = db.prepare('SELECT status FROM prep_progress WHERE topic_key = ?').get(key)?.status ?? 'todo';
      status = STATUSES[(STATUSES.indexOf(cur) + 1) % STATUSES.length];
    }
    setProgress(db, key, { status, rating: rating ? Number(rating) : undefined });
    log(`${key}: ${status}`);
  }

  const topics = listTopics(db, { jobId: jobId || null });
  if (!topics.length) log('No prep topics for this job (no gaps found, or job not shortlisted/applied).');
  for (const t of topics) {
    const box = t.status === 'confident' ? '[x]' : t.status === 'practicing' ? '[~]' : '[ ]';
    log(`${box} ${t.topic_key.padEnd(24)} w=${t.weight.toFixed(2)} ${t.self_rating ? `rating ${t.self_rating}` : ''}`.trimEnd());
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: ProfileManager } = await import('../core/profileManager.js');
  const pm = new ProfileManager();
  runPrep(process.argv.slice(2), { loadProfile: () => pm.loadProfile() })
    .then(c => process.exit(c))
    .catch(e => { console.error('Error:', e.message); process.exit(1); });
}
