import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { createServer } from '../../src/web/server.js';

const profile = { name: 'T', archetypes: [], techStack: [], salary: {} };

function mkDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  const ins = db.prepare(`INSERT INTO jobs (id, company_id, ats_platform, title, location, url, apply_url, description, status, posted_at, first_seen_at, last_seen_at)
    VALUES (?, 'Acme', 'greenhouse', ?, 'Remote', ?, ?, 'd', 'active', 0, 0, 0)`);
  for (const id of ['j1', 'j2', 'j3']) ins.run(id, `Role ${id}`, `https://x/${id}`, `https://x/${id}`);
  const p = db.prepare('INSERT INTO pipeline (job_id, state, state_changed_at, score) VALUES (?, ?, ?, ?)');
  p.run('j1', 'shortlisted', 1, 4.5);
  p.run('j2', 'applied', 2, null);
  return db;
}

async function boot(db, digestDir) {
  const server = createServer({ db, loadProfile: () => profile, digestDir });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const patch = (base, id, body) => fetch(`${base}/api/pipeline/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

describe('pipeline dashboard API', () => {
  let db, server, base, dir;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hj-digest-'));
    db = mkDb();
    ({ server, base } = await boot(db, dir));
  });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); return new Promise(r => server.close(r)); });

  test('GET /api/pipeline returns lanes and joined items', async () => {
    const body = await (await fetch(base + '/api/pipeline')).json();
    expect(body.lanes.map(l => l.key)).toContain('shortlisted');
    const j1 = body.items.find(i => i.jobId === 'j1');
    expect(j1).toMatchObject({ state: 'shortlisted', company: 'Acme', title: 'Role j1', score: 4.5 });
  });

  test('states filter narrows results', async () => {
    const body = await (await fetch(base + '/api/pipeline?states=applied')).json();
    expect(body.items.map(i => i.jobId)).toEqual(['j2']);
  });

  test('legal PATCH transitions and writes an audit event', async () => {
    const res = await patch(base, 'j1', { state: 'applying' });
    expect(res.status).toBe(200);
    expect((await res.json()).state).toBe('applying');
    const ev = db.prepare('SELECT * FROM pipeline_events WHERE job_id = ?').get('j1');
    expect(ev).toMatchObject({ from_state: 'shortlisted', to_state: 'applying', actor: 'user:dashboard' });
  });

  test('illegal transition is rejected with 409 and state unchanged', async () => {
    const res = await patch(base, 'j2', { state: 'offer' });
    expect(res.status).toBe(409);
    expect(db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get('j2').state).toBe('applied');
  });

  test('unknown state 400, unknown job 404, bad JSON 400', async () => {
    expect((await patch(base, 'j2', { state: 'bogus' })).status).toBe(400);
    expect((await patch(base, 'nope', { state: 'queued' })).status).toBe(404);
    const bad = await fetch(`${base}/api/pipeline/j2`, { method: 'PATCH', body: '{oops' });
    expect(bad.status).toBe(400);
  });

  test('digest: live build when no file, then latest file wins', async () => {
    const live = await (await fetch(base + '/api/digest/latest')).json();
    expect(live.source).toBe('live');
    expect(Array.isArray(live.readyToApply)).toBe(true);
    fs.writeFileSync(path.join(dir, '2026-01-01.json'), JSON.stringify({ date: '2026-01-01', readyToApply: [] }));
    fs.writeFileSync(path.join(dir, '2026-01-02.json'), JSON.stringify({ date: '2026-01-02', readyToApply: [{ title: 'X' }] }));
    const file = await (await fetch(base + '/api/digest/latest')).json();
    expect(file).toMatchObject({ source: 'file', date: '2026-01-02' });
  });

  test('prep lists topics when tables exist', async () => {
    db.prepare(`INSERT INTO prep_topics (topic_key, label, weight, source_job_ids, source, updated_at) VALUES ('sd', 'System design', 2, '[]', 't', 0)`).run();
    const body = await (await fetch(base + '/api/prep')).json();
    expect(body.available).toBe(true);
    expect(body.topics[0]).toMatchObject({ topicKey: 'sd', status: 'todo' });
  });

  test('prep degrades gracefully when tables are missing', async () => {
    const db2 = mkDb();
    db2.exec('DROP TABLE prep_progress; DROP TABLE prep_sessions; DROP TABLE prep_topics;');
    const { server: s2, base: b2 } = await boot(db2, dir);
    try {
      expect(await (await fetch(b2 + '/api/prep')).json()).toEqual({ available: false, topics: [] });
    } finally { await new Promise(r => s2.close(r)); }
  });

  test('dashboard HTML has Today and Prep tabs', async () => {
    const html = await (await fetch(base + '/')).text();
    expect(html).toContain('data-view="today"');
    expect(html).toContain('data-view="prep"');
  });
});
