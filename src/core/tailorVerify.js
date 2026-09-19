/**
 * tailorVerify.js — deterministic truthfulness judge for LLM-tailored résumés
 * (docs/fable51-answers.md §6). Pure: no I/O, no network, no LLM.
 *
 * The LLM only rewrites; code decides. Each tailored bullet is compared to its
 * source bullet: numbers, named entities/tools, scope verbs and length must all
 * be supported by the base résumé. Anything else is reverted to the source
 * bullet verbatim. Verdicts per bullet:
 *   grounded    — identical to source (after normalisation)
 *   reworded-ok — differs but every check passed
 *   ungrounded  — failed a check; source bullet kept (`reason` says why)
 */

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'as', 'is', 'from']);

const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const words = s => norm(s).replace(/[^a-z0-9+#./\s-]/g, ' ').split(/\s+/).filter(Boolean);

const LEAD = new Set(['led', 'lead', 'leading', 'managed', 'manage', 'owned', 'owning', 'headed', 'directed', 'architected', 'spearheaded']);
const BUILD = new Set(['built', 'build', 'developed', 'created', 'designed', 'implemented', 'engineered', 'authored', 'architected']);
const SCOPE_CLASS = {
  led: LEAD, lead: LEAD, managed: LEAD, owned: LEAD, headed: LEAD, directed: LEAD, architected: LEAD, spearheaded: LEAD,
  built: BUILD,
};

/** Normalised numeric tokens: "40%", "2x", "1,200", "$5k". */
export function numbersIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/\d[\d,.]*\s*(?:%|k\b|x\b|\+)?/gi)) {
    out.push(m[0].replace(/\s+/g, '').replace(/[.,]+$/, '').toLowerCase());
  }
  return out;
}

/** Entity-like tokens (capitalised, tool-like, dotted/hashed), first word of the text skipped. */
export function entitiesIn(text) {
  const t = String(text ?? '').trim();
  const out = [];
  const re = /[A-Z][A-Za-z0-9+#.]*|\b[a-z]+\/[a-z]+\b|\b[a-z]+[.#+][a-z0-9]+\b/g;
  let m;
  while ((m = re.exec(t))) {
    if (m.index === 0) continue; // sentence-initial word: capitalised by grammar, not a name
    // skip capitalised words that start a sentence inside the text
    if (/[.!?]\s+$/.test(t.slice(0, m.index))) continue;
    const tok = m[0].replace(/[.]+$/, '');
    if (tok.length > 1 || /[+#]/.test(tok)) out.push(tok);
  }
  return out;
}

/** Everything the candidate genuinely has: skills, employers, and every word/entity of the base résumé. */
export function buildLexicon(base) {
  const lex = new Set();
  const addText = t => { for (const w of words(t)) lex.add(w); for (const e of entitiesIn(` ${t}`)) lex.add(norm(e)); };
  for (const s of base?.skills || []) { lex.add(norm(s)); addText(s); }
  for (const g of Object.values(base?.skillGroups || {})) for (const s of g || []) addText(s);
  addText(base?.title); addText(base?.summary);
  for (const j of base?.experience || []) {
    addText(j.title); addText(j.company); addText(j.desc);
    for (const b of j.bullets || []) addText(b);
  }
  for (const c of base?.certificates || []) addText(typeof c === 'string' ? c : c?.name);
  for (const e of base?.education || []) { addText(e.degree); addText(e.institution || e.school); }
  return lex;
}

function baseNumbers(base) {
  const set = new Set();
  const add = t => numbersIn(t).forEach(n => set.add(n));
  add(base?.summary);
  for (const j of base?.experience || []) { add(j.desc); add(j.period); for (const b of j.bullets || []) add(b); }
  return set;
}

/**
 * Check `text` against `source` (a bullet, or the whole résumé text for the summary).
 * @returns {string|null} fail reason ('number'|'entity'|'scope'|'length') or null
 */
export function checkRewrite(text, source, lexicon, { checkLength = true, numberPool = null } = {}) {
  const srcNums = numberPool || new Set(numbersIn(source));
  for (const n of numbersIn(text)) if (!srcNums.has(n)) return `number:${n}`;

  const srcWords = new Set(words(source));
  for (const e of entitiesIn(text)) {
    const k = norm(e);
    if (STOP.has(k)) continue;
    if (!srcWords.has(k) && !lexicon.has(k)) return `entity:${e}`;
  }

  for (const w of words(text)) {
    const cls = SCOPE_CLASS[w];
    if (cls && !words(source).some(sw => cls.has(sw))) return `scope:${w}`;
  }

  if (checkLength) {
    const s = String(source).trim().length;
    if (s) {
      const r = String(text).trim().length / s;
      if (r < 0.6 || r > 1.4) return `length:${r.toFixed(2)}`;
    }
  }
  return null;
}

function bestSourceIndex(text, bullets) {
  const tw = new Set(words(text).filter(w => !STOP.has(w)));
  let best = -1, bestScore = 0;
  bullets.forEach((b, i) => {
    const bw = words(b).filter(w => !STOP.has(w));
    if (!bw.length) return;
    const hit = bw.filter(w => tw.has(w)).length / bw.length;
    if (hit > bestScore) { bestScore = hit; best = i; }
  });
  return bestScore >= 0.3 ? best : -1;
}

const asBullet = b => (typeof b === 'string' ? { text: b } : (b && typeof b === 'object' ? b : { text: '' }));

function verifySummary(base, tailoredSummary, lexicon, numberPool) {
  const baseText = [base.summary, ...(base.experience || []).flatMap(j => [j.desc, ...(j.bullets || [])])].join(' ');
  const sentences = String(tailoredSummary).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const kept = [], dropped = [];
  for (const s of sentences) {
    const reason = checkRewrite(s, baseText, lexicon, { checkLength: false, numberPool });
    if (reason) dropped.push({ text: s, reason }); else kept.push(s);
  }
  const changed = norm(tailoredSummary) !== norm(base.summary);
  if (!kept.length) {
    return { text: base.summary || '', result: base.summary ? 'kept-source' : 'dropped', tailored: tailoredSummary, dropped, changed };
  }
  const text = kept.join(' ');
  return { text, result: dropped.length ? 'partial' : (changed ? 'reworded-ok' : 'grounded'), tailored: tailoredSummary, dropped, changed };
}

/**
 * @param {object} base      canonical resume (fromProfile)
 * @param {object} tailored  LLM output { summary?, skills?, experience:[{company,title?,bullets:[string|{source_index,text}]}] }
 * @param {{keywords?: string[]}} [opts]
 * @returns {{tailored: object, report: object}} `tailored` is safe to hand to mergeTailored.
 */
export function verifyTailored(base, tailored = {}, { keywords = [] } = {}) {
  const t = tailored || {};
  const lexicon = buildLexicon(base);
  const numberPool = baseNumbers(base);
  const report = { summary: null, skills: null, jobs: [], keywords: null, counts: {}, warnings: [] };
  const safe = {};

  // summary
  if (t.summary) {
    const v = verifySummary(base, t.summary, lexicon, numberPool);
    report.summary = { result: v.result, tailored: v.tailored, final: v.text, dropped: v.dropped };
    if (v.text) safe.summary = v.text;
  }

  // skills — reorder/subset only (mergeTailored's intersectSkills also enforces this)
  if (Array.isArray(t.skills) && t.skills.length) {
    const baseKeys = new Set((base.skills || []).map(norm));
    const rejected = t.skills.filter(s => !baseKeys.has(norm(s)));
    report.skills = { rejected };
    safe.skills = t.skills;
  }

  // experience
  const jobs = Array.isArray(t.experience) ? t.experience : [];
  const used = new Set();
  safe.experience = [];
  (base.experience || []).forEach(job => {
    const mi = jobs.findIndex((x, i) => !used.has(i) && norm(x?.company) === norm(job.company) &&
      (!x?.title || norm(x.title) === norm(job.title)));
    const mj = mi !== -1 ? mi : jobs.findIndex((x, i) => !used.has(i) && norm(x?.company) === norm(job.company));
    const src = job.bullets || [];
    const entry = { company: job.company, title: job.title, bullets: [] };
    const rows = [];
    if (mj === -1) {
      // job not returned: nothing to verify, base kept by mergeTailored
      report.jobs.push({ company: job.company, title: job.title, bullets: [], missing: true });
      return;
    }
    used.add(mj);
    const tb = (jobs[mj].bullets || []).map(asBullet);
    const claimed = new Set();
    src.forEach((srcBullet, i) => {
      // pair by position unless the model named a source_index
      let cand = tb.find(b => Number.isInteger(b.source_index) && b.source_index === i && !b._used);
      if (!cand) {
        const positional = tb[i];
        if (positional && !positional._used && !(Number.isInteger(positional.source_index) && positional.source_index !== i)) cand = positional;
      }
      if (!cand) {
        const guess = tb.find(b => !b._used && bestSourceIndex(b.text, src) === i);
        if (guess) cand = guess;
      }
      if (!cand || !String(cand.text ?? '').trim()) {
        entry.bullets.push(srcBullet);
        rows.push({ source: srcBullet, tailored: cand ? String(cand.text ?? '') : null, final: srcBullet, result: 'ungrounded', reason: 'missing' });
        return;
      }
      cand._used = true; claimed.add(i);
      const text = String(cand.text).trim();
      if (norm(text) === norm(srcBullet)) {
        entry.bullets.push(srcBullet);
        rows.push({ source: srcBullet, tailored: text, final: srcBullet, result: 'grounded' });
        return;
      }
      const reason = checkRewrite(text, srcBullet, lexicon);
      if (reason) {
        entry.bullets.push(srcBullet);
        rows.push({ source: srcBullet, tailored: text, final: srcBullet, result: 'ungrounded', reason });
      } else {
        entry.bullets.push(text);
        rows.push({ source: srcBullet, tailored: text, final: text, result: 'reworded-ok' });
      }
    });
    const extras = tb.filter(b => !b._used && String(b.text ?? '').trim());
    for (const b of extras) rows.push({ source: null, tailored: String(b.text), final: null, result: 'ungrounded', reason: 'extra-bullet' });
    safe.experience.push(entry);
    report.jobs.push({ company: job.company, title: job.title, bullets: rows });
  });

  // counts
  const all = report.jobs.flatMap(j => j.bullets);
  const c = { grounded: 0, 'reworded-ok': 0, ungrounded: 0 };
  for (const r of all) c[r.result]++;
  report.counts = c;

  // keywords: only ones the candidate genuinely has, cap 10, no stuffing
  const skillKeys = new Set((base.skills || []).map(norm));
  const targets = [...new Set(keywords.map(norm))]
    .filter(k => k && (skillKeys.has(k) || lexicon.has(k))).slice(0, 10);
  const finalText = norm([
    safe.summary ?? base.summary,
    ...(safe.skills || base.skills || []),
    ...safe.experience.flatMap(j => j.bullets),
  ].join(' \n '));
  const present = [], missing = [], dense = [];
  for (const k of targets) {
    const n = finalText.split(k).length - 1;
    if (n > 0) present.push(k); else missing.push(k);
    if (n > 3) dense.push(k);
  }
  report.keywords = { targets, present, missing, dense, coverage: targets.length ? present.length / targets.length : null };
  if (dense.length) report.warnings.push(`keyword density > 3: ${dense.join(', ')}`);
  if (report.skills?.rejected.length) report.warnings.push(`skills not in base dropped: ${report.skills.rejected.join(', ')}`);
  if (c.ungrounded) report.warnings.push(`${c.ungrounded} bullet(s) reverted to source`);
  if (report.summary && ['partial', 'kept-source', 'dropped'].includes(report.summary.result)) {
    report.warnings.push(`summary ${report.summary.result}`);
  }
  report.ok = report.warnings.length === 0;
  return { tailored: safe, report };
}

const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ') || '-';

/** Render the report as markdown (the `tailor-report.md` beside the PDF). */
export function renderTailorReport(report, { title = 'Tailoring report' } = {}) {
  const L = [`# ${title}`, ''];
  const c = report.counts || {};
  L.push(`Bullets: ${c.grounded || 0} grounded, ${c['reworded-ok'] || 0} reworded-ok, ${c.ungrounded || 0} ungrounded (reverted to source).`, '');
  if (report.warnings?.length) { L.push('## Warnings', '', ...report.warnings.map(w => `- ${w}`), ''); }

  if (report.summary) {
    const s = report.summary;
    L.push('## Summary', '', `Result: **${s.result}**`, '', `Tailored: ${cell(s.tailored)}`, '', `Final: ${cell(s.final)}`, '');
    for (const d of s.dropped || []) L.push(`- dropped: "${cell(d.text)}" (${d.reason})`);
    if (s.dropped?.length) L.push('');
  }

  L.push('## Experience', '');
  for (const j of report.jobs) {
    L.push(`### ${cell(j.title)} - ${cell(j.company)}`, '');
    if (j.missing) { L.push('_Not returned by the model; base bullets kept._', ''); continue; }
    L.push('| Source | Tailored | Result |', '|---|---|---|');
    for (const b of j.bullets) {
      L.push(`| ${cell(b.source)} | ${cell(b.tailored)} | ${b.result}${b.reason ? ` (${b.reason})` : ''} |`);
    }
    L.push('');
  }

  const k = report.keywords;
  if (k) {
    L.push('## Keyword coverage', '',
      `Coverage: ${k.coverage == null ? 'n/a' : Math.round(k.coverage * 100) + '%'} (${k.present.length}/${k.targets.length})`,
      `- present: ${k.present.join(', ') || '-'}`,
      `- missing: ${k.missing.join(', ') || '-'}`,
      `- over-used (>3): ${k.dense.join(', ') || '-'}`, '');
  }
  return L.join('\n');
}
