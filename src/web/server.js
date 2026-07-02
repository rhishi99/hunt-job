#!/usr/bin/env node
// Local-only web dashboard server. Stdlib http only — no express, no new deps.
// Serves dashboard.html at "/" and a small JSON API backed by SQLite (plan §5.2).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../core/db.js';
import ProfileManager from '../core/profileManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'dashboard.html');
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
export function createServer({ db, loadProfile } = {}) {
  db = db || getDb();
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
