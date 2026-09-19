// Inbox processing — docs/fable51-answers.md §5 (T7). Source-agnostic: the IMAP
// reader (imapSource.js) or a test fake supplies messages; this module
// classifies, matches to pipeline rows, and either proposes/applies a state via
// transition() (actor 'inbox') or parks the message in `inbox_events` with
// needs_review = 1. Bodies/addresses are never stored — domain + subject only,
// plus a <=300 char snippet on review rows.
import { transition, ACTORS } from '../pipeline/states.js';
import { classify, matchJob, isWanted, parseIcs, domainOf } from './classify.js';

const DAY = 24 * 3600 * 1000;
const CANDIDATE_WINDOW_DAYS = 120;
const CANDIDATE_STATES = ['applied', 'acknowledged', 'screening', 'interview'];
const CHAIN = ['applied', 'acknowledged', 'screening', 'interview', 'offer'];
const TARGET = {
  'application-received': 'acknowledged',
  assessment: 'screening',
  'interview-invite': 'interview',
  offer: 'offer',
  rejection: 'rejected',
};
const AUTO_MATCH_MIN = 0.75;
const AUTO_CONF_MIN = 0.8;
const REJECT_CONF_MIN = 0.85; // rejection is destructive: needs the higher confidence flag
const REJECT_AUTO_FROM = ['applied', 'acknowledged', 'screening'];

/** '14d' | '2w' | '36h' | number-of-days -> ms; null when unparsable. */
export function parseSince(v) {
  if (v == null) return null;
  const m = String(v).trim().match(/^(\d+)\s*([dwh]?)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || 'd').toLowerCase();
  return n * (unit === 'w' ? 7 * DAY : unit === 'h' ? 3600 * 1000 : DAY);
}

export function loadCandidates(db, now = Date.now()) {
  return db.prepare(
    `SELECT p.job_id AS jobId, j.title, p.state,
            COALESCE(j.employer, c.name, j.company_id) AS company
     FROM pipeline p
     JOIN jobs j ON j.id = p.job_id
     LEFT JOIN companies c ON c.id = j.company_id
     WHERE p.state IN (${CANDIDATE_STATES.map(() => '?').join(',')}) AND p.state_changed_at >= ?`
  ).all(...CANDIDATE_STATES, now - CANDIDATE_WINDOW_DAYS * DAY);
}

/**
 * Decide what to do for one classified+matched message. Pure.
 * @returns {{action: 'apply'|'review'|'noop', to?: string, reason: string}}
 */
export function decide({ outcome, confidence, match, state }) {
  if (outcome === 'other') return { action: 'noop', reason: 'no outcome' };
  if (!match.jobId) return { action: 'review', reason: match.reason || 'no match' };
  const to = TARGET[outcome];
  if (outcome === 'offer') return { action: 'review', to, reason: 'offer always needs review' };
  if (match.score < AUTO_MATCH_MIN) return { action: 'review', to, reason: 'low match confidence' };
  if (outcome === 'rejection') {
    if (!REJECT_AUTO_FROM.includes(state)) return { action: 'review', to, reason: `rejection from ${state}` };
    if (confidence < REJECT_CONF_MIN) return { action: 'review', to, reason: 'low rejection confidence' };
    return { action: 'apply', to, reason: 'rejection' };
  }
  if (confidence < AUTO_CONF_MIN) return { action: 'review', to, reason: 'low classification confidence' };
  const from = CHAIN.indexOf(state);
  const target = CHAIN.indexOf(to);
  if (from < 0 || target < 0) return { action: 'review', to, reason: `unexpected state ${state}` };
  if (target === from) return { action: 'noop', to, reason: 'already in that state' };
  if (target < from) return { action: 'review', to, reason: 'would move backwards' };
  return { action: 'apply', to, reason: outcome };
}

/** Step through the legal chain (applied -> ... -> to), one transition() per hop. */
export function advanceTo(db, jobId, to, { actor, reason }) {
  if (to === 'rejected') return transition(db, jobId, 'rejected', { actor, reason });
  let row = db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get(jobId);
  let i = CHAIN.indexOf(row?.state);
  const end = CHAIN.indexOf(to);
  if (i < 0 || end < 0 || end <= i) throw new Error(`cannot advance ${row?.state} -> ${to}`);
  while (i < end) {
    i += 1;
    transition(db, jobId, CHAIN[i], { actor, reason });
  }
  return db.prepare('SELECT * FROM pipeline WHERE job_id = ?').get(jobId);
}

function sinceDate(db, sinceMs, now) {
  if (sinceMs != null) return new Date(now - sinceMs);
  const last = db.prepare('SELECT MAX(received_at) AS t FROM inbox_events').get().t;
  return new Date(last ? last - DAY : now - 14 * DAY); // one day overlap; message_id dedupes
}

/**
 * @param {object} o
 * @param {import('better-sqlite3').Database} o.db
 * @param {{fetchMessages: Function}} o.source
 * @param {number|null} [o.sinceMs]  window; null = since last stored event (default 14d)
 * @param {boolean} [o.dryRun]       classify + match + report; no DB writes, no transitions
 * @param {number} [o.now]
 */
export async function processInbox({ db, source, sinceMs = null, dryRun = false, now = Date.now() }) {
  const candidates = loadCandidates(db, now);
  const messages = await source.fetchMessages({
    since: sinceDate(db, sinceMs, now),
    wanted: env => isWanted(env, candidates),
  });

  const summary = { seen: messages.length, skipped: 0, applied: [], review: [], noop: 0, dryRun };
  const seen = db.prepare('SELECT 1 FROM inbox_events WHERE message_id = ?');
  const insert = db.prepare(
    `INSERT INTO inbox_events (message_id, received_at, from_domain, subject, outcome, confidence,
                               matched_job_id, matched_by, needs_review, snippet, applied, at)
     VALUES (@message_id, @received_at, @from_domain, @subject, @outcome, @confidence,
             @matched_job_id, @matched_by, @needs_review, @snippet, @applied, @at)`
  );

  for (const msg of messages) {
    if (!msg.messageId || (!dryRun && seen.get(msg.messageId))) { summary.skipped++; continue; }
    if (!isWanted(msg, candidates)) { summary.skipped++; continue; }

    const ics = msg.ics ? parseIcs(msg.ics) : null;
    const cls = classify({ ...msg, ics: ics || (msg.ics ? {} : null) });
    const match = matchJob(msg, candidates);
    const state = candidates.find(c => c.jobId === match.jobId)?.state;
    const d = decide({ outcome: cls.outcome, confidence: cls.confidence, match, state });
    const confidence = match.jobId ? Math.min(cls.confidence, match.score) : cls.confidence;

    const report = {
      messageId: msg.messageId, domain: domainOf(msg.from?.address), subject: msg.subject,
      outcome: cls.outcome, confidence, jobId: match.jobId, to: d.to, reason: d.reason,
      interviewAt: ics?.startsAt ?? null,
    };
    if (d.action === 'noop') summary.noop++;
    else if (d.action === 'apply') summary.applied.push(report);
    else summary.review.push(report);
    if (dryRun) continue;

    let applied = 0;
    if (d.action === 'apply') {
      try {
        advanceTo(db, match.jobId, d.to, { actor: ACTORS.INBOX, reason: msg.messageId });
        applied = 1;
        if (ics?.startsAt && d.to === 'interview') {
          db.prepare('UPDATE pipeline SET interview_at = ? WHERE job_id = ?').run(ics.startsAt, match.jobId);
        }
      } catch (err) {
        d.action = 'review'; d.reason = err.message;
        summary.applied.pop(); summary.review.push({ ...report, reason: err.message });
      }
    }
    const needsReview = d.action === 'review' ? 1 : 0;
    insert.run({
      message_id: msg.messageId,
      received_at: msg.date ? new Date(msg.date).getTime() : now,
      from_domain: report.domain,
      subject: String(msg.subject || '').slice(0, 200),
      outcome: cls.outcome,
      confidence,
      matched_job_id: match.jobId,
      matched_by: match.by,
      needs_review: needsReview,
      snippet: needsReview ? String(msg.snippet || '').slice(0, 300) : null,
      applied,
      at: now,
    });
  }
  return summary;
}

/** Review-queue rows plus the jobs a human can assign them to (dashboard + CLI). */
export function listReview(db, now = Date.now()) {
  const events = db.prepare(
    `SELECT id, received_at AS receivedAt, from_domain AS fromDomain, subject, outcome, confidence,
            matched_job_id AS matchedJobId, snippet
     FROM inbox_events WHERE needs_review = 1 ORDER BY received_at DESC LIMIT 200`
  ).all();
  return { events, candidates: loadCandidates(db, now) };
}

/**
 * Human resolution of a review row. `assign` applies the row's outcome to
 * `jobId` with the given actor; `ignore` just closes it.
 */
export function resolveEvent(db, id, { action, jobId }, actor = ACTORS.DASHBOARD) {
  const ev = db.prepare('SELECT * FROM inbox_events WHERE id = ?').get(id);
  if (!ev) return { error: 404, message: 'inbox event not found' };
  if (action === 'ignore') {
    db.prepare('UPDATE inbox_events SET needs_review = 0, snippet = NULL WHERE id = ?').run(id);
    return { id, resolved: 'ignored' };
  }
  if (action !== 'assign') return { error: 400, message: 'action must be assign or ignore' };
  const to = TARGET[ev.outcome];
  if (!jobId || !to) return { error: 400, message: 'assign needs a jobId and an actionable outcome' };
  if (!db.prepare('SELECT 1 FROM pipeline WHERE job_id = ?').get(jobId)) return { error: 404, message: 'job not in pipeline' };
  try {
    advanceTo(db, jobId, to, { actor, reason: ev.message_id });
  } catch (e) {
    return { error: 409, message: e.message };
  }
  db.prepare('UPDATE inbox_events SET needs_review = 0, applied = 1, matched_job_id = ?, matched_by = ?, snippet = NULL WHERE id = ?')
    .run(jobId, 'user', id);
  return { id, resolved: 'assigned', jobId, state: to };
}

/** Delete resolved rows older than `days`. */
export function purgeResolved(db, days, now = Date.now()) {
  return db.prepare('DELETE FROM inbox_events WHERE needs_review = 0 AND at < ?').run(now - days * DAY).changes;
}
