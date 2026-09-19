#!/usr/bin/env node
// Local-only web dashboard server. Stdlib http only — no express, no new deps.
// Serves dashboard.html at "/" and a small JSON API backed by SQLite (plan §5.2).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../core/db.js';
import ProfileManager from '../core/profileManager.js';
import { transition, ACTORS, STATES } from '../core/pipeline/states.js';
import { buildDigest } from '../core/pipeline/digest.js';
import { listReview, resolveEvent } from '../core/inbox/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'dashboard.html');
const DIGEST_DIR = path.join(__dirname, '../../data/digest');
const FRESH_MS = 48 * 60 * 60 * 1000;
const APP_STATUSES = new Set(['scanned', 'evaluated', 'applied', 'interview', 'offer', 'rejected']);

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(data);
}

/**
 * jobs.company_id is inconsistent in the wild: newer rows store the numeric companies.id FK,
 * older rows store the literal company name string directly. Resolve either shape to a display name.
 */
function companyNameMap(db) {
  return new Map(db.prepare('SELECT id, name FROM companies').all().map(c => [String(c.id), c.name]));
}
function resolveCompany(companyId, companies) {
  return companies.get(String(companyId)) || companyId;
}

/** Latest evaluation row per job url (evaluations has no unique-url constraint — re-evals happen). */
function latestEvalsByUrl(db) {
  const rows = db.prepare(`
    SELECT e.* FROM evaluations e
    WHERE e.evaluated_at = (SELECT MAX(e2.evaluated_at) FROM evaluations e2 WHERE e2.url = e.url)
  `).all();
  return new Map(rows.map(r => [r.url, r]));
}

function getStats(db) {
  return {
    scanned: db.prepare('SELECT COUNT(*) c FROM jobs').get().c,
    evaluated: db.prepare('SELECT COUNT(*) c FROM evaluations').get().c,
    applied: db.prepare('SELECT COUNT(*) c FROM applications').get().c,
    offers: db.prepare(`SELECT COUNT(*) c FROM applications WHERE lower(status) = 'offer'`).get().c
  };
}

function getJobs(db, query) {
  const evalByUrl = latestEvalsByUrl(db);
  const companies = companyNameMap(db);
  let jobs = db.prepare('SELECT id, company_id, title, location, url, status, posted_at FROM jobs').all()
    .map(j => {
      const ev = evalByUrl.get(j.url);
      let score = null;
      if (ev) { try { score = JSON.parse(ev.evaluation).overallScore ?? null; } catch { /* malformed blob */ } }
      return {
        id: j.id, company: resolveCompany(j.company_id, companies), title: j.title, location: j.location,
        url: j.url || null, score, postedAt: j.posted_at ? new Date(j.posted_at).toISOString() : null, status: j.status
      };
    });

  if (query.status && query.status !== 'all') jobs = jobs.filter(j => j.status === query.status);
  const minScore = parseFloat(query.minScore);
  if (!Number.isNaN(minScore) && minScore > 0) jobs = jobs.filter(j => !j.score || j.score >= minScore);
  if (query.fresh === 'fresh') {
    const now = Date.now();
    jobs = jobs.filter(j => j.postedAt && (now - new Date(j.postedAt).getTime()) < FRESH_MS);
  }
  return jobs;
}

function getEvaluations(db) {
  const jobByUrl = new Map(db.prepare('SELECT id, url, title, company_id FROM jobs').all().map(j => [j.url, j]));
  const companies = companyNameMap(db);
  return db.prepare('SELECT * FROM evaluations ORDER BY evaluated_at DESC').all().map(r => {
    let ev = {};
    try { ev = JSON.parse(r.evaluation); } catch { /* malformed blob */ }
    const job = jobByUrl.get(r.url);
    return {
      id: r.id,
      jobId: job ? job.id : null,
      company: job ? resolveCompany(job.company_id, companies) : 'Unknown',
      title: job ? job.title : (r.url || 'Unknown'),
      overallScore: ev.overallScore ?? null,
      dimensions: ev.dimensions || {},
      matches: ev.matches || [],
      mismatches: ev.mismatches || [],
      reasoning: ev.reasoning || '',
      recommendation: ev.recommendation || '',
      evaluatedAt: r.evaluated_at
    };
  });
}

function getApplications(db) {
  const jobIdByUrl = new Map(db.prepare('SELECT id, url FROM jobs').all().map(j => [j.url, j.id]));
  return db.prepare('SELECT * FROM applications ORDER BY applied_at DESC').all().map(r => ({
    id: r.id,
    jobId: jobIdByUrl.get(r.url) || null,
    company: r.company,
    title: r.title,
    status: (r.status || 'applied').toLowerCase(),
    appliedAt: r.applied_at
  }));
}

function patchApplication(db, id, status) {
  if (!APP_STATUSES.has(status)) return { error: 400, message: `status must be one of: ${[...APP_STATUSES].join(', ')}` };
  const row = db.prepare('SELECT id FROM applications WHERE id = ?').get(id);
  if (!row) return { error: 404, message: 'application not found' };
  const updatedAt = new Date().toISOString();
  db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
  return { id, status, updatedAt };
}

// Kanban lanes (docs/fable51-answers.md 2.6). Every state in states.js belongs to exactly one lane.
const LANES = [
  { key: 'discovered', label: 'Discovered', states: ['discovered', 'queued'] },
  { key: 'evaluated', label: 'Evaluated', states: ['evaluated', 'maybe', 'skip'] },
  { key: 'shortlisted', label: 'Shortlisted', states: ['shortlisted', 'prepared'] },
  { key: 'applied', label: 'Applied', states: ['applying', 'applied', 'acknowledged', 'screening'] },
  { key: 'interview', label: 'Interview', states: ['interview'] },
  { key: 'offer', label: 'Offer', states: ['offer'] },
  { key: 'closed', label: 'Closed', states: ['rejected', 'expired', 'withdrawn', 'archived'] }
];

function getPipeline(db, query) {
  let states = query.states ? String(query.states).split(',').filter(s => STATES.includes(s)) : null;
  if (!states) states = STATES.filter(s => s !== 'filtered_out');
  const marks = states.map(() => '?').join(',');
  const items = db.prepare(`
    SELECT p.job_id AS jobId, p.state, p.state_changed_at AS stateChangedAt, p.score, p.user_label AS userLabel,
           j.title, j.location, j.url, COALESCE(j.employer, c.name, j.company_id) AS company
    FROM pipeline p
    JOIN jobs j ON j.id = p.job_id
    LEFT JOIN companies c ON c.id = j.company_id
    WHERE p.state IN (${marks})
    ORDER BY p.state_changed_at DESC
    LIMIT 500
  `).all(...states);
  return { lanes: LANES, items };
}

function patchPipeline(db, jobId, body) {
  const to = body && body.state;
  if (typeof to !== 'string' || !STATES.includes(to)) return { error: 400, message: `state must be one of: ${STATES.join(', ')}` };
  if (!db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(jobId)) return { error: 404, message: 'job not found' };
  try {
    const row = transition(db, jobId, to, { actor: ACTORS.DASHBOARD, reason: body.reason || null });
    return { jobId, state: row.state, stateChangedAt: row.state_changed_at };
  } catch (e) {
    return { error: /^illegal transition/.test(e.message) ? 409 : 400, message: e.message };
  }
}

async function getDigest(db, loadProfile, digestDir) {
  let files = [];
  try { files = fs.readdirSync(digestDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { /* no dir yet */ }
  if (files.length) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(digestDir, files[files.length - 1]), 'utf-8'));
      return { source: 'file', ...json };
    } catch { /* corrupt file: fall through to live build */ }
  }
  let profile = null;
  try { profile = await loadProfile(); } catch { /* digest tolerates a missing profile */ }
  const { json } = await buildDigest(db, new Date().toISOString().slice(0, 10), { profile: profile || {} });
  return { source: 'live', ...json };
}

function getPrep(db) {
  const has = n => !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(n);
  if (!has('prep_topics')) return { available: false, topics: [] };
  const topics = db.prepare(`
    SELECT t.topic_key AS topicKey, t.label, t.category, t.weight,
           COALESCE(g.status, 'todo') AS status, g.self_rating AS selfRating, g.last_practiced_at AS lastPracticedAt
    FROM prep_topics t
    LEFT JOIN prep_progress g ON g.topic_key = t.topic_key
    ORDER BY t.weight DESC, t.label
  `).all();
  return { available: true, topics };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/** Builds the request handler. `db`/`loadProfile` are injectable for tests. */
export function createServer({ db, loadProfile, digestDir } = {}) {
  db = db || getDb();
  digestDir = digestDir || DIGEST_DIR;
  loadProfile = loadProfile || (() => new ProfileManager().loadProfile());

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const query = Object.fromEntries(url.searchParams);

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        return send(res, 200, fs.readFileSync(HTML_PATH, 'utf-8'), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/api/stats') return send(res, 200, getStats(db));
      if (req.method === 'GET' && url.pathname === '/api/jobs') return send(res, 200, getJobs(db, query));
      if (req.method === 'GET' && url.pathname === '/api/evaluations') return send(res, 200, getEvaluations(db));
      if (req.method === 'GET' && url.pathname === '/api/applications') return send(res, 200, getApplications(db));
      if (req.method === 'GET' && url.pathname === '/api/profile') {
        const profile = await loadProfile();
        return profile ? send(res, 200, profile) : send(res, 404, { error: 'profile not found' });
      }
      if (req.method === 'GET' && url.pathname === '/api/pipeline') return send(res, 200, getPipeline(db, query));
      if (req.method === 'GET' && url.pathname === '/api/digest/latest') return send(res, 200, await getDigest(db, loadProfile, digestDir));
      if (req.method === 'GET' && url.pathname === '/api/prep') return send(res, 200, getPrep(db));
      if (req.method === 'GET' && url.pathname === '/api/inbox') return send(res, 200, listReview(db));
      const inboxMatch = req.method === 'PATCH' && url.pathname.match(/^\/api\/inbox\/(\d+)$/);
      if (inboxMatch) {
        let body;
        try { body = await readJsonBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
        const result = resolveEvent(db, Number(inboxMatch[1]), body || {});
        if (result.error) return send(res, result.error, { error: result.message });
        return send(res, 200, result);
      }
      const pipeMatch = req.method === 'PATCH' && url.pathname.match(/^\/api\/pipeline\/([^/]+)$/);
      if (pipeMatch) {
        let body;
        try { body = await readJsonBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
        const result = patchPipeline(db, decodeURIComponent(pipeMatch[1]), body);
        if (result.error) return send(res, result.error, { error: result.message });
        return send(res, 200, result);
      }
      const patchMatch = req.method === 'PATCH' && url.pathname.match(/^\/api\/applications\/([^/]+)$/);
      if (patchMatch) {
        let body;
        try { body = await readJsonBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
        const result = patchApplication(db, decodeURIComponent(patchMatch[1]), body.status);
        if (result.error) return send(res, result.error, { error: result.message });
        return send(res, 200, result);
      }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  });
}

export function start(port = process.env.HUNT_JOB_PORT || 7777) {
  const server = createServer({});
  server.listen(port, '127.0.0.1', () => {
    console.log(`Hunt-Job dashboard running at http://127.0.0.1:${port} (Ctrl+C to stop)`);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
