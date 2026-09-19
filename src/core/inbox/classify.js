// Inbox classification + job matching — docs/fable51-answers.md §5.2.
// Pure functions only: no IMAP, no DB writes. Header/subject/sender rules first;
// the snippet (first ~300 chars of the text part) is a weaker second signal.

export const ATS_MAILER_DOMAINS = [
  'greenhouse-mail.io', 'greenhouse.io', 'hire.lever.co', 'lever.co', 'ashbyhq.com',
  'smartrecruiters.com', 'myworkday.com', 'myworkdayjobs.com', 'icims.com',
  'oraclecloud.com', 'successfactors.com', 'eightfold.ai', 'phenom.com', 'amazon.jobs',
  'workablemail.com', 'recruitee.com', 'jobvite.com',
];

export const OUTCOMES = ['application-received', 'rejection', 'interview-invite', 'assessment', 'offer', 'other'];

const RE = {
  offer: /\boffer\b|\bcompensation package\b/i,
  rejection: /unfortunately|not (be )?moving forward|other candidates|\bregret\b|will not be proceeding|decided not to/i,
  assessment: /assessment|coding (challenge|test)|take[- ]home|online test|hackerrank|codility|codesignal/i,
  interview: /interview|schedule (a|your) (call|chat|conversation)|availability|meet (with )?the team|invitation:/i,
  received: /application (received|submitted)|thank you for (applying|your (application|interest))|we('ve| have) received your application/i,
};

/** Domain of an address, lowercased; '' when unparsable. */
export function domainOf(address) {
  const m = String(address || '').toLowerCase().match(/@([a-z0-9.-]+)/);
  return m ? m[1] : '';
}

function domainMatches(domain, list) {
  return list.some(d => domain === d || domain.endsWith(`.${d}`));
}

export function isAtsMailer(domain) {
  return domainMatches(domain, ATS_MAILER_DOMAINS);
}

/**
 * @param {{from?: {name?: string, address?: string}, subject?: string, snippet?: string, ics?: object|null}} msg
 * @returns {{outcome: string, confidence: number, via: string}}
 */
export function classify(msg) {
  const subject = String(msg.subject || '');
  const snippet = String(msg.snippet || '');
  const ats = isAtsMailer(domainOf(msg.from?.address));
  const bump = ats ? 0.05 : 0;
  // Order matters: "unfortunately ... interview" is a rejection, and an offer
  // mail may also say "interview".
  const order = [
    ['offer', 'offer'], ['rejection', 'rejection'], ['assessment', 'assessment'],
    ['interview', 'interview-invite'], ['received', 'application-received'],
  ];
  for (const [key, outcome] of order) {
    if (RE[key].test(subject)) return { outcome, confidence: Math.min(0.95, 0.85 + bump), via: 'subject' };
  }
  if (msg.ics) return { outcome: 'interview-invite', confidence: 0.85, via: 'ics' };
  for (const [key, outcome] of order) {
    if (RE[key].test(snippet)) return { outcome, confidence: Math.min(0.8, 0.7 + bump), via: 'snippet' };
  }
  return { outcome: 'other', confidence: 0.5, via: 'none' };
}

// ---- matching ----------------------------------------------------------

const NOISE = new Set([
  'inc', 'ltd', 'llc', 'pvt', 'private', 'limited', 'corp', 'co', 'company', 'technologies',
  'technology', 'tech', 'labs', 'software', 'solutions', 'india', 'the', 'and', 'group',
]);
const TITLE_NOISE = new Set(['senior', 'sr', 'junior', 'jr', 'i', 'ii', 'iii', 'the', 'and', 'of', 'for', 'a', 'an']);

function tokens(s, noise) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(' ').filter(t => t && !noise.has(t));
}

export function companyTokens(name) {
  return tokens(name, NOISE);
}

/** Does `haystack` (lowercased, punctuation stripped) mention every company token as a word? */
function mentionsCompany(hay, toks) {
  if (!toks.length) return false;
  const words = new Set(hay.split(' '));
  const joined = toks.join('');
  return toks.every(t => words.has(t)) || (joined.length >= 4 && hay.replace(/ /g, '').includes(joined));
}

function normalizeHay(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

/**
 * Cheap pre-filter run on envelope data alone (before any body download):
 * an ATS mailer, or a sender/subject that names a company we applied to.
 */
export function isWanted(msg, candidates) {
  const domain = domainOf(msg.from?.address);
  if (isAtsMailer(domain)) return true;
  const hay = normalizeHay(`${domain} ${msg.from?.name || ''} ${msg.subject || ''}`);
  return candidates.some(c => mentionsCompany(hay, companyTokens(c.company)));
}

/**
 * Match a message to one open application.
 * candidates: [{jobId, company, title, state}]
 * Returns {jobId|null, score, by, tie, reason}.
 */
export function matchJob(msg, candidates) {
  const domain = domainOf(msg.from?.address);
  const hayMeta = normalizeHay(`${domain} ${msg.from?.name || ''} ${msg.subject || ''}`);
  const hayAll = normalizeHay(`${hayMeta} ${msg.snippet || ''}`);
  const msgWords = new Set(tokens(`${msg.subject || ''} ${msg.snippet || ''}`, TITLE_NOISE));

  const atCompany = [];
  for (const c of candidates) {
    const toks = companyTokens(c.company);
    if (!mentionsCompany(hayAll, toks)) continue;
    const inMeta = mentionsCompany(hayMeta, toks);
    const tt = tokens(c.title, TITLE_NOISE);
    const titleHit = tt.length ? tt.filter(t => msgWords.has(t)).length / tt.length : 0;
    atCompany.push({ c, inMeta, titleHit });
  }
  if (!atCompany.length) return { jobId: null, score: 0, by: null, tie: false, reason: 'no company match' };

  const scored = atCompany
    .map(x => ({ ...x, score: (x.inMeta ? 0.6 : 0.45) + 0.4 * x.titleHit }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (scored.length > 1) {
    // Several open applications at this company: only a clearly better title match wins.
    if (best.score - scored[1].score < 0.15) {
      return { jobId: null, score: best.score, by: 'company', tie: true, reason: 'multiple open applications at company' };
    }
    return { jobId: best.c.jobId, score: Math.min(0.95, best.score + 0.1), by: 'company+title', tie: false, reason: null };
  }
  // Unique open application at that company: company alone is enough when named in the headers.
  const score = best.inMeta ? Math.max(best.score, 0.8) : best.score;
  return { jobId: best.c.jobId, score, by: best.titleHit > 0 ? 'company+title' : 'company', tie: false, reason: null };
}

// ---- calendar ----------------------------------------------------------

function icsDate(value, params) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // Only IST is resolved without a tz database; other TZIDs/floating times are read as UTC.
  if (!z && /TZID=(Asia\/(Kolkata|Calcutta)|IST)/i.test(params || '')) ms -= (5 * 60 + 30) * 60 * 1000;
  return ms;
}

/** Tiny ICS reader: first VEVENT's DTSTART / SUMMARY / ORGANIZER. No dependency. */
export function parseIcs(text) {
  if (!text) return null;
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let inEvent = false;
  const ev = {};
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { inEvent = true; continue; }
    if (/^END:VEVENT/i.test(line)) break;
    if (!inEvent) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(';');
    const value = line.slice(idx + 1).trim();
    const key = name.toUpperCase();
    if (key === 'DTSTART') ev.startsAt = icsDate(value, paramParts.join(';'));
    else if (key === 'SUMMARY') ev.summary = value;
    else if (key === 'ORGANIZER') ev.organizer = value.replace(/^mailto:/i, '');
  }
  return ev.startsAt ? ev : null;
}
