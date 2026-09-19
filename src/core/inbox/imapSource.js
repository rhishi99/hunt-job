// Read-only Gmail IMAP source. Credentials come from the environment only and
// are never logged: imapflow's logger is disabled and errors are re-thrown
// with the password scrubbed. Mailbox is opened with readOnly (EXAMINE), so no
// flag/delete change is possible.
//
// Source contract (also implemented by test fakes):
//   fetchMessages({ since: Date, wanted?: (envelope) => boolean })
//     -> [{ messageId, date, from: {name, address}, subject, snippet, ics }]
// `ics` is the raw text of a text/calendar part or null.

export const DEFAULT_USER = 'rhishi99@gmail.com';

export function readCredentials(env = process.env) {
  const pass = env.HUNTJOB_MAIL_APP_PASSWORD;
  if (!pass) return null;
  return { user: env.HUNTJOB_MAIL_USER || DEFAULT_USER, pass };
}

export const SETUP_STEPS = [
  'Inbox capture is not configured. To enable it:',
  '  1. Turn on 2-Step Verification for the Gmail account (myaccount.google.com/security).',
  '  2. Create an app password at https://myaccount.google.com/apppasswords',
  '     (name it "hunt-job"; copy the 16-character password).',
  '  3. Set these environment variables (PowerShell, persistent):',
  `       setx HUNTJOB_MAIL_USER "${DEFAULT_USER}"`,
  '       setx HUNTJOB_MAIL_APP_PASSWORD "<the 16-character app password>"',
  '     or add both lines to .env. Then open a new terminal.',
  '  4. Make sure IMAP is enabled in Gmail settings (Forwarding and POP/IMAP).',
  '  5. Run: node hunt-job.js inbox --since 14d --dry-run',
  'The mailbox is opened read-only; nothing is deleted, moved or marked read.',
];

function scrub(err, pass) {
  const msg = String(err?.message || err).split(pass).join('***');
  return new Error(`IMAP error: ${msg}`);
}

export function createImapSource({ user, pass, host = 'imap.gmail.com', port = 993 }) {
  return {
    async fetchMessages({ since, wanted = () => true }) {
      const { ImapFlow } = await import('imapflow');
      const { simpleParser } = await import('mailparser');
      const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
          const uids = await client.search({ since }, { uid: true });
          if (!uids || !uids.length) return [];
          // Collect envelopes first: issuing commands inside a fetch loop deadlocks imapflow.
          const envs = [];
          for await (const m of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
            const f = m.envelope?.from?.[0] || {};
            envs.push({
              uid: m.uid,
              messageId: m.envelope?.messageId,
              date: m.envelope?.date,
              subject: m.envelope?.subject || '',
              from: { name: f.name || '', address: f.address || '' },
            });
          }
          const out = [];
          for (const e of envs) {
            if (!e.messageId || !wanted(e)) continue;
            const full = await client.fetchOne(e.uid, { source: true }, { uid: true });
            const parsed = await simpleParser(full.source);
            const cal = (parsed.attachments || []).find(a => /text\/calendar/i.test(a.contentType) || /\.ics$/i.test(a.filename || ''));
            out.push({
              messageId: e.messageId,
              date: e.date,
              from: e.from,
              subject: e.subject,
              snippet: String(parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, 300),
              ics: cal ? cal.content.toString('utf-8') : null,
            });
          }
          return out;
        } finally {
          lock.release();
        }
      } catch (err) {
        throw scrub(err, pass);
      } finally {
        try { await client.logout(); } catch { /* connection already gone */ }
      }
    },
  };
}
