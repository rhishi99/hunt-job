// S1 rules (hard vetoes) + S2 lexical evidence score — docs/fable51-answers.md
// §1.2, §1.3. Pure, deterministic, no LLM, no network call. `applyRules` and
// `lexicalScore` take plain objects so they're unit-testable without a DB;
// `prefilterJobs` is the only function that touches `db`, following the `db`
// as explicit first param convention of ./queue.js, ./states.js, ./identity.js.
//
// S1 exists to kill postings the profile's `rules:` block (schema documented
// in src/core/profileManager.js#getRules) says are dealbreakers, before any
// LLM call is spent on them. S2 exists to RANK survivors, not decide — it
// orders the queue so a tight daily budget (§1.4) is spent on the most
// promising postings first; nothing here should be read as a hard cutoff.

import { getRules } from '../profileManager.js';
import { fromProfile } from '../resumeData.js';
import { jobMatchesArchetype, isIndiaLocation, cleanHtml } from '../scan/normalize.js';

const DAY_MS = 86400000;

// Junior/associate/intern title words — tested only when a profile sets
// `rules.minSeniority` (§1.2: "junior/associate/intern titles → veto").
const JUNIOR_TITLE_PATTERNS = [
  '\\bjunior\\b', '\\bjr\\.?\\b', '\\bassociate\\b',
  '\\bintern(ship)?\\b', '\\btrainee\\b', '\\bentry[\\s-]?level\\b',
];

/** Applies each `patterns` regex (case-insensitive) to `text`; returns the first match's literal text, or null. */
function matchAny(patterns, text) {
  if (!Array.isArray(patterns)) return null;
  for (const p of patterns) {
    try {
      const m = new RegExp(String(p), 'i').exec(text);
      if (m) return m[0];
    } catch {
      // A hand-edited profile can carry an invalid regex — skip it rather
      // than crash a scheduled run over one bad pattern.
    }
  }
  return null;
}

/** Turns a matched literal ("night shift") into a reason slug ("night_shift"). */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'match';
}

/**
 * S1: deterministic dealbreaker rules. `rules` is the profile's optional
 * structured block (`getRules(profile)`, schema in profileManager.js). A
 * missing/null `rules` is not an error — it just means no vetoes apply.
 *
 * `job` needs: title, description (raw or already-clean HTML), location,
 * employmentType, postedAt (unix ms, optional).
 *
 * @returns {{veto: boolean, reason: string|null}}
 */
export function applyRules(job, rules) {
  if (!rules) return { veto: false, reason: null };

  const title = String(job?.title || '');
  const text = cleanHtml(job?.description || '');
  const location = String(job?.location || '');
  const employmentType = job?.employmentType ?? null;
  const postedAt = Number.isFinite(job?.postedAt) ? job.postedAt : null;

  // allowedOnsiteCities — vetoes an onsite-only posting outside the listed
  // cities. Unknown/empty location is never vetoed here (S0 already applied
  // the India filter; without a mode/city we have nothing to check against).
  if (Array.isArray(rules.allowedOnsiteCities) && rules.allowedOnsiteCities.length) {
    const loc = location.toLowerCase();
    const isRemote = /\bremote\b|\banywhere\b|\bworldwide\b/.test(loc);
    if (loc && !isRemote) {
      const allowed = rules.allowedOnsiteCities.some(city => loc.includes(String(city).toLowerCase()));
      if (!allowed) return { veto: true, reason: 'veto:onsite_city' };
    }
  }

  const titleHit = matchAny(rules.vetoTitle, title);
  if (titleHit) return { veto: true, reason: `veto:${slug(titleHit)}` };

  const textHit = matchAny(rules.vetoText, text);
  if (textHit) return { veto: true, reason: `veto:${slug(textHit)}` };

  // minSeniority — the value itself (e.g. 'senior') only gates whether the
  // check runs; S1 has no extracted seniority to compare against (that's
  // S3, §3.2), so it can only catch titles that self-report as junior.
  if (rules.minSeniority && matchAny(JUNIOR_TITLE_PATTERNS, title)) {
    return { veto: true, reason: 'veto:seniority' };
  }

  // employmentTypes — allow-list; `null` in the list accepts a posting whose
  // provider reported no commitment at all (never assume full-time, same
  // rule scan/normalize.js already applies for gigs).
  if (Array.isArray(rules.employmentTypes) && rules.employmentTypes.length) {
    const allowed = new Set(rules.employmentTypes.map(t => (t === null ? null : String(t))));
    if (!allowed.has(employmentType)) return { veto: true, reason: 'veto:employment_type' };
  }

  if (rules.maxAgeDays && postedAt) {
    const ageDays = (Date.now() - postedAt) / DAY_MS;
    if (ageDays > rules.maxAgeDays) return { veto: true, reason: 'veto:stale' };
  }

  return { veto: false, reason: null };
}

// ── S2 lexical evidence score ───────────────────────────────────────────────

// Collapses spelling variants onto one canonical token before matching, so
// "k8s" in a JD counts as evidence the candidate lists "kubernetes", etc.
// Only the three pairs named in §1.2 are implemented; extend here as more
// false-negatives are observed. 'iac' deliberately collapses together with
// EITHER terraform or ansible — either is accepted as IaC evidence.
const ALIAS_GROUPS = [
  ['kubernetes', 'k8s'],
  ['cicd', 'ci/cd'],
  ['iac', 'terraform', 'ansible'],
];
const ALIAS_MAP = new Map();
for (const group of ALIAS_GROUPS) {
  const canonical = group[0];
  for (const term of group) ALIAS_MAP.set(term, canonical);
}
const normalizeAlias = token => ALIAS_MAP.get(token) || token;

// Tokens that carry no skill signal — general English + common JD boilerplate.
// Filtering these out of "distinct skills in JD" keeps the S2 denominator
// close to actual requirement terms instead of every word in the posting.
const STOPWORDS = new Set([
  'the', 'and', 'or', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'as', 'at', 'by', 'from', 'this', 'that', 'these', 'those', 'it', 'its',
  'we', 'our', 'you', 'your', 'they', 'their', 'who', 'what', 'when', 'where', 'why', 'how', 'will',
  'can', 'must', 'should', 'would', 'into', 'across', 'within', 'more', 'than', 'such', 'if', 'not',
  'have', 'has', 'had', 'do', 'does', 'did', 'about', 'all', 'any', 'also', 'other', 'some', 'per',
  'experience', 'years', 'year', 'team', 'work', 'working', 'role', 'company', 'job', 'candidate',
  'strong', 'ability', 'skills', 'skill', 'including', 'environment', 'like', 'etc', 'new', 'high',
  'level', 'good', 'excellent', 'looking', 'join', 'responsible', 'responsibilities', 'requirements',
]);

const tokenize = text => (String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9+/.#-]*/g) || []);

/** BM25-lite: sums a classic BM25 score for `queryTokens` over each `docs` string, then saturates to 0..1. */
function bm25Lite(queryTokens, docs, { k1 = 1.5, b = 0.75 } = {}) {
  const docTokens = docs.map(tokenize).filter(t => t.length);
  if (!docTokens.length || !queryTokens.length) return 0;

  const N = docTokens.length;
  const avgdl = docTokens.reduce((s, d) => s + d.length, 0) / N;
  const df = new Map();
  for (const terms of docTokens) {
    for (const t of new Set(terms)) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = t => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
  const qset = new Set(queryTokens);

  let total = 0;
  for (const terms of docTokens) {
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    const dl = terms.length;
    for (const t of qset) {
      const f = tf.get(t) || 0;
      if (!f) continue;
      total += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl)));
    }
  }
  // Saturate rather than divide by a corpus-specific max — a handful of solid
  // term matches across a few bullets should approach 1 without needing one.
  return total > 0 ? 1 - Math.exp(-total / 5) : 0;
}

/**
 * S2: evidence overlap between the JD and the candidate lexicon (§1.2/§1.3).
 * `job.description` may be raw HTML (cleaned here) or already-plain text.
 * `profile` is the parsed `profile.yml` object; the candidate lexicon is
 * derived from it via `resumeData.js#fromProfile` (techStack + skillGroups +
 * experience bullets), the same shape the resume generator uses.
 *
 * score = 0.6 * (distinct skill hits / distinct skills in JD's first 3k chars)
 *       + 0.4 * BM25-lite(JD tokens, candidate experience bullets)
 *
 * "Skills in the JD" = distinct non-stopword tokens (alias-normalized) in the
 * first 3000 chars — there is no external skill dictionary in the design doc,
 * so a stopword-filtered token is the operational definition of "skill-like".
 *
 * @returns {{score: number, reason: string}} reason like 'lexical:0.07'
 */
export function lexicalScore(job, profile) {
  const jdText = cleanHtml(job?.description || '').slice(0, 3000);
  const resume = fromProfile(profile || {});

  const candidateSkills = new Set((resume.skills || []).map(s => normalizeAlias(String(s).toLowerCase())));
  const bullets = resume.experience.flatMap(e => e.bullets || []);

  const jdTokens = tokenize(jdText).map(normalizeAlias);
  const jdSkillTokens = [...new Set(jdTokens.filter(t => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t)))];
  const hits = jdSkillTokens.filter(t => candidateSkills.has(t));
  const skillRatio = jdSkillTokens.length ? hits.length / jdSkillTokens.length : 0;

  const bm25 = bm25Lite(jdTokens, bullets);

  const score = Math.max(0, Math.min(1, 0.6 * skillRatio + 0.4 * bm25));
  return { score, reason: `lexical:${score.toFixed(2)}` };
}

// ── DB entry point ───────────────────────────────────────────────────────────

/**
 * Runs S1 + S2 over every active, archetype-matching job in `jobs` and writes
 * `prefilter_score` / `prefilter_reason` (migration v5, src/core/db.js). Pure
 * per-row logic lives in applyRules/lexicalScore above; this function is only
 * the DB read/write shell, same split as ./queue.js and ./states.js.
 *
 * Vetoed rows get score 0 (§3.3: "any veto -> score 0") and the `veto:*`
 * reason; survivors get their S2 score and a `lexical:N.NN` reason.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{profile: object, since?: number}} opts - `since` is a day count;
 *   omit to prefilter every active archetype-matching job regardless of age.
 * @returns {{total: number, vetoed: number, scored: number}}
 */
export function prefilterJobs(db, { profile, since } = {}) {
  if (!profile) throw new Error('prefilterJobs: profile is required');

  const archetypes = profile.archetypes || [];
  const rules = getRules(profile);
  const sinceMs = since ? Date.now() - since * DAY_MS : null;

  const rows = db.prepare(`
    SELECT id, title, location, description, employment_type AS employmentType,
           posted_at AS postedAt, first_seen_at AS firstSeenAt
    FROM jobs WHERE status = 'active'
  `).all();

  const matching = rows.filter(j =>
    (archetypes.length === 0 || archetypes.some(a => jobMatchesArchetype(j.title || '', null, a))) &&
    isIndiaLocation(j.location) &&
    (!sinceMs || (j.postedAt ?? j.firstSeenAt ?? 0) >= sinceMs)
  );

  const update = db.prepare('UPDATE jobs SET prefilter_score = ?, prefilter_reason = ? WHERE id = ?');
  let vetoed = 0;
  let scored = 0;

  db.transaction(items => {
    for (const job of items) {
      const { veto, reason: vetoReason } = applyRules(job, rules);
      if (veto) {
        update.run(0, vetoReason, job.id);
        vetoed++;
      } else {
        const { score, reason } = lexicalScore(job, profile);
        update.run(score, reason, job.id);
        scored++;
      }
    }
  })(matching);

  return { total: matching.length, vetoed, scored };
}
