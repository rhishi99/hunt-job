import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { createServer } from '../../src/web/server.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function seed(db) {
  db.prepare(`
    INSERT INTO jobs (id, company_id, ats_platform, title, location, url, apply_url, description, status, posted_at, first_seen_at, last_seen_at)
    VALUES (@id, @company_id, 'greenhouse', @title, @location, @url, @url, 'desc', 'active', @posted_at, 0, 0)
  `).run({ id: 'j1', company_id: 'Stripe', title: 'Backend Engineer', location: 'Remote', url: 'https://x/1', posted_at: Date.now() - 3600000 });
  db.prepare(`
    INSERT INTO jobs (id, company_id, ats_platform, title, location, url, apply_url, description, status, posted_at, first_seen_at, last_seen_at)
    VALUES (@id, @company_id, 'lever', @title, @location, @url, @url, 'desc', 'closed', @posted_at, 0, 0)
  `).run({ id: 'j2', company_id: 'Paytm', title: 'SRE', location: 'Bengaluru', url: 'https://x/2', posted_at: Date.now() - 10 * 24 * 3600000 });
  // newer-style rows store the numeric companies.id FK instead of the literal name
  db.prepare(`INSERT INTO companies (id, name) VALUES (99, 'InMobi')`).run();
  db.prepare(`
    INSERT INTO jobs (id, company_id, ats_platform, title, location, url, apply_url, description, status, posted_at, first_seen_at, last_seen_at)
    VALUES ('j3', '99', 'greenhouse', 'SDE III', 'Bangalore', 'https://x/3', 'https://x/3', 'desc', 'active', @posted_at, 0, 0)
  `).run({ posted_at: Date.now() });

  db.prepare(`INSERT INTO evaluations (id, url, evaluation, profile, evaluated_at) VALUES (?, ?, ?, ?, ?)`)
    .run('e1', 'https://x/1', JSON.stringify({ overallScore: 4.2, recommendation: 'Apply', dimensions: { Salary: 4 }, matches: ['Node'], mismatches: [] }), '{}', '2026-01-01T00:00:00.000Z');
  // older eval for same url — latest-per-url logic should prefer e2
  db.prepare(`INSERT INTO evaluations (id, url, evaluation, profile, evaluated_at) VALUES (?, ?, ?, ?, ?)`)
    .run('e2', 'https://x/1', JSON.stringify({ overallScore: 4.8, recommendation: 'Apply', dimensions: { Salary: 5 }, matches: ['Node'], mismatches: [] }), '{}', '2026-02-01T00:00:00.000Z');

  db.prepare(`
    INSERT INTO applications (id, title, company, location, url, status, applied_at)
    VALUES ('a1', 'Backend Engineer', 'Stripe', 'Remote', 'https://x/1', 'Applied', '2026-02-02T00:00:00.000Z')
  `).run();
}

describe('web dashboard API server', () => {
  let db, server, base;

  beforeAll(async () => {
    db = freshDb();
    seed(db);
    server = createServer({ db, loadProfile: () => ({ name: 'Test User', currentRole: 'SWE', yearsOfExperience: 3, archetypes: [], techStack: [], salary: { min: 1, max: 2, currency: 'INR' } }) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise(resolve => server.close(resolve)));

  test('GET / serves the dashboard HTML', async () => {
    const res = await fetch(base + '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Hunt-Job Dashboard');
  });

  test('GET /api/stats returns counts', async () => {
    const res = await fetch(base + '/api/stats');
    const body = await res.json();
    expect(body).toEqual({ scanned: 3, evaluated: 2, applied: 1, offers: 0 });
  });

  test('GET /api/jobs maps score from the latest evaluation per url and resolves company_id', async () => {
    const res = await fetch(base + '/api/jobs');
    const jobs = await res.json();
    expect(jobs).toHaveLength(3);
    const j1 = jobs.find(j => j.id === 'j1');
    expect(j1.company).toBe('Stripe');
    expect(j1.score).toBe(4.8); // latest eval, not the older 4.2
    const j2 = jobs.find(j => j.id === 'j2');
    expect(j2.score).toBeNull();
    expect(j2.status).toBe('closed');
    const j3 = jobs.find(j => j.id === 'j3');
    expect(j3.company).toBe('InMobi'); // company_id='99' resolved via companies table, not left as '99'
  });

  test('GET /api/jobs filters by status/minScore/fresh', async () => {
    const active = await (await fetch(base + '/api/jobs?status=active')).json();
    expect(active.map(j => j.id).sort()).toEqual(['j1', 'j3']);

    const highScore = await (await fetch(base + '/api/jobs?minScore=4.5')).json();
    // j2/j3 have no score — the dashboard's own client-side filter (`if (job.score && job.score < minScore)`)
    // treats falsy scores as "not excluded", so the server mirrors that: null-score jobs always pass minScore.
    expect(highScore.map(j => j.id).sort()).toEqual(['j1', 'j2', 'j3']);

    const fresh = await (await fetch(base + '/api/jobs?fresh=fresh')).json();
    expect(fresh.map(j => j.id).sort()).toEqual(['j1', 'j3']);
  });

  test('GET /api/evaluations resolves company/title via job url join', async () => {
    const res = await fetch(base + '/api/evaluations');
    const evals = await res.json();
    expect(evals).toHaveLength(2);
    const latest = evals.find(e => e.id === 'e2');
    expect(latest.jobId).toBe('j1');
    expect(latest.company).toBe('Stripe');
    expect(latest.overallScore).toBe(4.8);
  });

  test('GET /api/applications lowercases status and resolves jobId', async () => {
    const res = await fetch(base + '/api/applications');
    const apps = await res.json();
    expect(apps).toEqual([{ id: 'a1', jobId: 'j1', company: 'Stripe', title: 'Backend Engineer', status: 'applied', appliedAt: '2026-02-02T00:00:00.000Z' }]);
  });

  test('GET /api/profile returns the injected profile', async () => {
    const res = await fetch(base + '/api/profile');
    const profile = await res.json();
    expect(profile.name).toBe('Test User');
  });

  test('PATCH /api/applications/:id updates status and round-trips', async () => {
    const res = await fetch(base + '/api/applications/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'interview' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('interview');

    const apps = await (await fetch(base + '/api/applications')).json();
    expect(apps.find(a => a.id === 'a1').status).toBe('interview');
  });

  test('PATCH with invalid status returns 400', async () => {
    const res = await fetch(base + '/api/applications/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not-a-real-status' })
    });
    expect(res.status).toBe(400);
  });

  test('PATCH unknown id returns 404', async () => {
    const res = await fetch(base + '/api/applications/does-not-exist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' })
    });
    expect(res.status).toBe(404);
  });

  test('PATCH with malformed JSON body returns 400', async () => {
    const res = await fetch(base + '/api/applications/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json'
    });
    expect(res.status).toBe(400);
  });

  test('unknown route returns 404', async () => {
    const res = await fetch(base + '/api/nope');
    expect(res.status).toBe(404);
  });
});
