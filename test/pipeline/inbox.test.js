import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { classify, parseIcs, matchJob } from '../../src/core/inbox/classify.js';
import { processInbox, parseSince, resolveEvent, purgeResolved } from '../../src/core/inbox/index.js';
import { runInboxCli } from '../../src/cli/inbox.js';
import { readCredentials } from '../../src/core/inbox/imapSource.js';
import { buildDigest } from '../../src/core/pipeline/digest.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

function addApplied(id, company, title, state = 'applied') {
  const now = Date.now();
  db.prepare(`INSERT INTO jobs (id, company_id, ats_platform, title, status, first_seen_at, last_seen_at, employer)
              VALUES (?, ?, 'greenhouse', ?, 'active', ?, ?, ?)`).run(id, company, title, now, now, company);
  db.prepare(`INSERT INTO pipeline (job_id, state, state_changed_at) VALUES (?, ?, ?)`).run(id, state, now);
}

const fake = msgs => ({ fetchMessages: async () => msgs });
const msg = (o = {}) => ({
  messageId: `<${Math.random()}@x>`, date: new Date(), from: { name: 'Razorpay Recruiting', address: 'no-reply@greenhouse-mail.io' },
  subject: 'Thank you for applying to Razorpay', snippet: '', ics: null, ...o,
});
const stateOf = id => db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get(id).state;

describe('classify', () => {
  test('subject rules', () => {
    expect(classify(msg({ subject: 'Your application received' })).outcome).toBe('application-received');
    expect(classify(msg({ subject: 'Unfortunately we are not moving forward' })).outcome).toBe('rejection');
    expect(classify(msg({ subject: 'Interview invitation' })).outcome).toBe('interview-invite');
    expect(classify(msg({ subject: 'Your HackerRank assessment' })).outcome).toBe('assessment');
    expect(classify(msg({ subject: 'Offer letter' })).outcome).toBe('offer');
    expect(classify(msg({ subject: 'Weekly jobs digest' })).outcome).toBe('other');
  });
  test('rejection beats interview wording', () => {
    expect(classify(msg({ subject: 'Update on your interview: unfortunately no' })).outcome).toBe('rejection');
  });
});

describe('ics', () => {
  test('parses start, summary, organizer, IST', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Asia/Kolkata:20260925T103000\r\nSUMMARY:Interview with\r\n  Razorpay\r\nORGANIZER:mailto:hr@razorpay.com\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const ev = parseIcs(ics);
    expect(ev.startsAt).toBe(Date.UTC(2026, 8, 25, 5, 0, 0));
    expect(ev.organizer).toBe('hr@razorpay.com');
    expect(parseIcs('BEGIN:VEVENT\nDTSTART:20260925T100000Z\nEND:VEVENT').startsAt).toBe(Date.UTC(2026, 8, 25, 10, 0, 0));
  });
});

describe('matching', () => {
  test('tie between two open applications at one company', () => {
    const c = [
      { jobId: 'a', company: 'Razorpay', title: 'Backend Engineer', state: 'applied' },
      { jobId: 'b', company: 'Razorpay', title: 'Data Engineer', state: 'applied' },
    ];
    const m = matchJob(msg({ subject: 'Thank you for applying to Razorpay' }), c);
    expect(m.jobId).toBeNull();
    expect(m.tie).toBe(true);
  });
  test('title breaks the tie', () => {
    const c = [
      { jobId: 'a', company: 'Razorpay', title: 'Backend Engineer', state: 'applied' },
      { jobId: 'b', company: 'Razorpay', title: 'Data Engineer', state: 'applied' },
    ];
    expect(matchJob(msg({ subject: 'Razorpay: your Data Engineer application' }), c).jobId).toBe('b');
  });
});

describe('processInbox', () => {
  test('auto-applies acknowledgement with actor inbox', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    const s = await processInbox({ db, source: fake([msg()]) });
    expect(s.applied).toHaveLength(1);
    expect(stateOf('j1')).toBe('acknowledged');
    const ev = db.prepare('SELECT actor FROM pipeline_events WHERE job_id = ? ORDER BY id DESC').get('j1');
    expect(ev.actor).toBe('inbox');
    const row = db.prepare('SELECT * FROM inbox_events').get();
    expect(row.applied).toBe(1);
    expect(row.snippet).toBeNull();
  });

  test('dedupes by message_id', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    const m = msg();
    await processInbox({ db, source: fake([m]) });
    const s2 = await processInbox({ db, source: fake([m]) });
    expect(s2.skipped).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM inbox_events').get().c).toBe(1);
  });

  test('dry-run writes nothing', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    const s = await processInbox({ db, source: fake([msg()]), dryRun: true });
    expect(s.applied).toHaveLength(1);
    expect(stateOf('j1')).toBe('applied');
    expect(db.prepare('SELECT COUNT(*) c FROM inbox_events').get().c).toBe(0);
  });

  test('unmatched goes to review with snippet', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    const m = msg({ from: { name: 'Someone', address: 'a@greenhouse-mail.io' }, subject: 'Thank you for applying to Globex', snippet: 'hello' });
    const s = await processInbox({ db, source: fake([m]) });
    expect(s.review).toHaveLength(1);
    expect(stateOf('j1')).toBe('applied');
    expect(db.prepare('SELECT needs_review, snippet FROM inbox_events').get()).toEqual({ needs_review: 1, snippet: 'hello' });
  });

  test('offer always review; rejection from interview review; rejection from applied auto', async () => {
    addApplied('o', 'Razorpay', 'Backend Engineer', 'interview');
    addApplied('r', 'Globex', 'SRE', 'applied');
    const s = await processInbox({ db, source: fake([
      msg({ subject: 'Razorpay offer letter' }),
      msg({ subject: 'Razorpay: unfortunately we are moving with other candidates' }),
      msg({ from: { name: 'Globex', address: 'jobs@globex.com' }, subject: 'Update from Globex: unfortunately, not moving forward' }),
    ]) });
    expect(stateOf('o')).toBe('interview');
    expect(stateOf('r')).toBe('rejected');
    expect(s.review).toHaveLength(2);
    expect(s.applied).toHaveLength(1);
  });

  test('interview invite with ics steps forward and sets interview_at', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    const ics = 'BEGIN:VEVENT\nDTSTART:20260925T100000Z\nSUMMARY:Interview\nEND:VEVENT';
    await processInbox({ db, source: fake([msg({ subject: 'Razorpay interview invite', ics })]) });
    expect(stateOf('j1')).toBe('interview');
    expect(db.prepare('SELECT interview_at FROM pipeline WHERE job_id = ?').get('j1').interview_at).toBe(Date.UTC(2026, 8, 25, 10));
  });

  test('backwards move goes to review', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer', 'interview');
    const s = await processInbox({ db, source: fake([msg({ subject: 'Razorpay HackerRank assessment' })]) });
    expect(s.review).toHaveLength(1);
    expect(stateOf('j1')).toBe('interview');
  });

  test('resolve: assign applies, ignore closes; purge removes resolved', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    await processInbox({ db, source: fake([msg({ from: { name: 'x', address: 'a@lever.co' }, subject: 'Thank you for applying' })]) });
    const id = db.prepare('SELECT id FROM inbox_events').get().id;
    expect(resolveEvent(db, id, { action: 'assign', jobId: 'j1' }).state).toBe('acknowledged');
    expect(stateOf('j1')).toBe('acknowledged');
    expect(purgeResolved(db, 90, Date.now() + 100 * 24 * 3600 * 1000)).toBe(1);
  });

  test('digest lists review + auto-applied', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    await processInbox({ db, source: fake([msg(), msg({ from: { name: 'x', address: 'a@lever.co' }, subject: 'Thank you for applying' })]) });
    const { markdown, json } = await buildDigest(db, '2026-09-19', { profile: {} });
    expect(json.inbox.autoApplied).toHaveLength(1);
    expect(json.inbox.needsReview).toHaveLength(1);
    expect(markdown).toContain('Needs review');
  });
});

describe('cli', () => {
  test('missing creds prints setup steps, no throw', async () => {
    const lines = [];
    const r = await runInboxCli([], { db, env: {}, out: l => lines.push(l) });
    expect(r.configured).toBe(false);
    expect(lines.join('\n')).toMatch(/apppasswords/);
    expect(lines.join('\n')).toMatch(/HUNTJOB_MAIL_APP_PASSWORD/);
  });
  test('injected source + --dry-run', async () => {
    addApplied('j1', 'Razorpay', 'Backend Engineer');
    const lines = [];
    const r = await runInboxCli(['--since', '7d', '--dry-run'], { db, source: fake([msg()]), out: l => lines.push(l) });
    expect(r.applied).toHaveLength(1);
    expect(stateOf('j1')).toBe('applied');
  });
  test('helpers', () => {
    expect(parseSince('14d')).toBe(14 * 86400000);
    expect(parseSince('x')).toBeNull();
    expect(readCredentials({})).toBeNull();
    expect(readCredentials({ HUNTJOB_MAIL_APP_PASSWORD: 'p' }).user).toBe('rhishi99@gmail.com');
  });
});
