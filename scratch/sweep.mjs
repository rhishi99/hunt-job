import Database from 'better-sqlite3';
import fs from 'fs';
const OUT = process.argv[2];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36';
const db = new Database('data/hunt-job.db', { readonly: true });
const rows = db.prepare("SELECT id,name,career_url FROM companies WHERE ats_platform IS NULL OR ats_platform=''").all();

function variants(name) {
  let n = name.toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(india|global tech|technologies|technology|corporation|pvt\.? ltd\.?|ltd\.?|inc\.?|group|solutions|systems|money|payments|rooms|electric|cabs|platforms|digital)\b/g, '').replace(/[&.']/g, ' ').trim();
  const words = n.split(/\s+/).filter(Boolean);
  const v = new Set([words.join(''), words.join('-'), words[0]]);
  return [...v].filter(s => s && s.length >= 3);
}
async function get(url, opts = {}) {
  const ctl = AbortSignal.timeout(opts.timeout || 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: opts.accept || 'application/json' }, redirect: 'follow', signal: ctl });
    const text = await r.text();
    return { status: r.status, text, url: r.url };
  } catch (e) { return { status: 0, text: '', err: e.message.slice(0, 60) }; }
}
const API = {
  greenhouse: s => [`https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=false`, t => JSON.parse(t).jobs?.length],
  lever:      s => [`https://api.lever.co/v0/postings/${s}?mode=json`, t => { const j = JSON.parse(t); return Array.isArray(j) ? j.length : undefined; }],
  ashby:      s => [`https://api.ashbyhq.com/posting-api/job-board/${s}`, t => JSON.parse(t).jobs?.length],
  smartrecruiters: s => [`https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`, t => JSON.parse(t).totalFound],
  workable:   s => [`https://apply.workable.com/api/v1/widget/accounts/${s}`, t => JSON.parse(t).jobs?.length],
  recruitee:  s => [`https://${s}.recruitee.com/api/offers/`, t => JSON.parse(t).offers?.length],
};
const MARK = [
  ['workday', /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com(\/[a-zA-Z0-9_-]+)?/i],
  ['greenhouse', /(?:boards(?:-api)?|job-boards)\.greenhouse\.io\/(?:v1\/boards\/|embed\/job_board\?for=)?([a-z0-9_-]+)/i],
  ['lever', /(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([a-z0-9_-]+)/i],
  ['ashby', /(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9_-]+)/i],
  ['smartrecruiters', /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/],
  ['phenom', /phApp\.ddo|phenompeople|phenom\.com/i],
  ['successfactors', /successfactors|jobTitle-link|rmk-/i],
  ['eightfold', /eightfold\.ai/i],
  ['oraclecloud', /\.fa\.[a-z0-9]+\.oraclecloud\.com|oraclecloud\.com\/hcmUI/i],
  ['icims', /icims\.com/i],
  ['taleo', /taleo\.net/i],
  ['darwinbox', /darwinbox/i],
  ['zoho', /zohorecruit/i],
  ['keka', /keka\.com/i],
  ['freshteam', /freshteam\.com/i],
  ['jsonld_jobposting', /"@type"\s*:\s*"JobPosting"/],
];
async function probe(c) {
  const rec = { id: c.id, name: c.name, career_url: c.career_url, api: [], workday: [], landing: {} };
  const vs = variants(c.name);
  for (const s of vs) {
    for (const [prov, mk] of Object.entries(API)) {
      const [url, count] = mk(s);
      const r = await get(url);
      if (r.status === 200) { let n; try { n = count(r.text); } catch {} if (n !== undefined) rec.api.push({ prov, slug: s, jobs: n }); }
    }
  }
  for (const s of vs.slice(0, 2)) for (const wd of ['wd1', 'wd3', 'wd5', 'wd12', 'wd103']) {
    const r = await get(`https://${s}.${wd}.myworkdayjobs.com/`, { accept: 'text/html' });
    if (r.status === 200) rec.workday.push({ tenant: s, wd, final: r.url });
  }
  const l = await get(c.career_url, { accept: 'text/html', timeout: 20000 });
  rec.landing = { status: l.status, final: l.url, markers: {} };
  for (const [k, re] of MARK) { const m = l.text.match(re); if (m) rec.landing.markers[k] = m[0].slice(0, 80); }
  rec.landing.jsonld_count = (l.text.match(/"@type"\s*:\s*"JobPosting"/g) || []).length;
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  return rec;
}
let i = 0; const results = [];
await Promise.all(Array.from({ length: 8 }, async () => { while (i < rows.length) { const c = rows[i++]; results.push(await probe(c)); } }));
for (const r of results) {
  const hits = [...r.api.map(a => `${a.prov}:${a.slug}(${a.jobs})`), ...r.workday.map(w => `workday:${w.tenant}.${w.wd}->${w.final.replace(/https:\/\/[^/]+/, '')}`), ...Object.entries(r.landing.markers).map(([k, v]) => `landing:${k}=${v}`)];
  console.log(`${r.name} | ${r.landing.status} | ${hits.join(' ; ') || '-'}`);
}
