import { describe, test, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';

const evaluateMock = vi.fn();
vi.mock('../../src/core/jobEvaluator.js', () => ({
  default: vi.fn().mockImplementation(() => ({ evaluate: evaluateMock })),
}));

const { parseArgs, syncPipelineAndEnqueue, makeEvaluateHandler, runOnce } = await import('../../src/cli/run.js');

const RULES = {
  vetoTitle: ['\\bL1\\b', 'support engineer'],
};

const PROFILE = {
  archetypes: ['DevOps Engineer'],
  rules: RULES,
  techStack: ['AWS', 'Terraform', 'Kubernetes'],
  skillGroups: {},
  experience: [{ title: 'Staff Engineer', company: 'Acme', bullets: ['Ran AWS and Kubernetes in prod.'] }],
  salary: { min: 40, max: 70, currency: '₹', unit: 'LPA' },
};

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare(`INSERT INTO companies (id, name) VALUES (1, 'Acme')`).run();
  return db;
}

function insertJob(db, id, overrides = {}) {
  const now = Date.now();
  const j = {
    id, company_id: 1, ats_platform: 'greenhouse', title: 'Senior DevOps Engineer', location: 'Pune, India',
    url: `https://example.com/${id}`, description: 'AWS, Terraform, Kubernetes role.', content_hash: 'hashA',
    employment_type: 'full-time', status: 'active', posted_at: now, first_seen_at: now, last_seen_at: now,
    ...overrides,
  };
  db.prepare(`
    INSERT INTO jobs (id, company_id, ats_platform, title, location, url, description, content_hash, employment_type, status, posted_at, first_seen_at, last_seen_at)
    VALUES (@id, @company_id, @ats_platform, @title, @location, @url, @description, @content_hash, @employment_type, @status, @posted_at, @first_seen_at, @last_seen_at)
  `).run(j);
  return j;
}

beforeEach(() => {
  evaluateMock.mockReset();
});

describe('parseArgs', () => {
  test('defaults', () => {
    const args = parseArgs([]);
    expect(args).toMatchObject({ once: false, dryRun: false, maxTasks: Infinity, archetype: null });
  });

  test('parses --once --dry-run --max-tasks --archetype', () => {
    const args = parseArgs(['--once', '--dry-run', '--max-tasks', '5', '--archetype', 'SRE']);
    expect(args).toMatchObject({ once: true, dryRun: true, maxTasks: 5, archetype: 'SRE' });
  });

  test('-a is a short alias for --archetype', () => {
    expect(parseArgs(['-a', 'Platform Engineer']).archetype).toBe('Platform Engineer');
  });

  test('--interval overrides the default', () => {
    expect(parseArgs(['--interval', '60']).interval).toBe(60);
  });
});

describe('syncPipelineAndEnqueue', () => {
  test('a new, non-vetoed, prefiltered job is discovered, queued, and enqueued', () => {
    const db = freshDb();
    insertJob(db, 'job:good');
    db.prepare(`UPDATE jobs SET prefilter_score = 0.7, prefilter_reason = 'lexical:0.70' WHERE id = 'job:good'`).run();

    const summary = syncPipelineAndEnqueue(db, { profile: PROFILE });

    expect(summary).toMatchObject({ discovered: 1, filteredOut: 0, enqueued: 1 });
    const pipeline = db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get('job:good');
    expect(pipeline.state).toBe('queued');
    const task = db.prepare(`SELECT * FROM tasks WHERE kind = 'evaluate' AND job_id = 'job:good'`).get();
    expect(task).toBeTruthy();
    expect(task.priority).toBe(70);
  });

  test('a vetoed job is discovered then immediately filtered_out, nothing enqueued', () => {
    const db = freshDb();
    insertJob(db, 'job:veto');
    db.prepare(`UPDATE jobs SET prefilter_score = 0, prefilter_reason = 'veto:seniority' WHERE id = 'job:veto'`).run();

    const summary = syncPipelineAndEnqueue(db, { profile: PROFILE });

    expect(summary).toMatchObject({ discovered: 1, filteredOut: 1, enqueued: 0 });
    const pipeline = db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get('job:veto');
    expect(pipeline.state).toBe('filtered_out');
    expect(db.prepare(`SELECT COUNT(*) c FROM tasks`).get().c).toBe(0);
  });

  test('dryRun makes no DB writes at all, but still reports what would happen', () => {
    const db = freshDb();
    insertJob(db, 'job:good');
    db.prepare(`UPDATE jobs SET prefilter_score = 0.7, prefilter_reason = 'lexical:0.70' WHERE id = 'job:good'`).run();

    const summary = syncPipelineAndEnqueue(db, { profile: PROFILE, dryRun: true });

    expect(summary).toMatchObject({ discovered: 1, enqueued: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM pipeline').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get().c).toBe(0);
  });

  test('an already-tracked job with an unchanged content_hash is left alone', () => {
    const db = freshDb();
    insertJob(db, 'job:done');
    db.prepare(`UPDATE jobs SET prefilter_score = 0.7, prefilter_reason = 'lexical:0.70' WHERE id = 'job:done'`).run();
    db.prepare(`INSERT INTO evaluations (id, url, evaluation, evaluated_at, content_hash) VALUES ('eval:1', 'u', '{}', 'now', 'hashA')`).run();
    db.prepare(`INSERT INTO pipeline (job_id, state, state_changed_at, evaluation_id) VALUES ('job:done', 'shortlisted', ?, 'eval:1')`).run(Date.now());

    const summary = syncPipelineAndEnqueue(db, { profile: PROFILE });

    expect(summary).toMatchObject({ discovered: 0, enqueued: 0, requeuedForRescan: 0, alreadyTracked: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get().c).toBe(0);
  });

  test('a changed content_hash sends an already-evaluated job back to queued and re-enqueues it', () => {
    const db = freshDb();
    insertJob(db, 'job:changed', { content_hash: 'hashB' }); // job's CURRENT hash
    db.prepare(`UPDATE jobs SET prefilter_score = 0.6, prefilter_reason = 'lexical:0.60' WHERE id = 'job:changed'`).run();
    db.prepare(`INSERT INTO evaluations (id, url, evaluation, evaluated_at, content_hash) VALUES ('eval:1', 'u', '{}', 'now', 'hashA')`).run(); // stale hash
    db.prepare(`INSERT INTO pipeline (job_id, state, state_changed_at, evaluation_id) VALUES ('job:changed', 'shortlisted', ?, 'eval:1')`).run(Date.now());

    const summary = syncPipelineAndEnqueue(db, { profile: PROFILE });

    expect(summary).toMatchObject({ requeuedForRescan: 1, alreadyTracked: 0 });
    const pipeline = db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get('job:changed');
    expect(pipeline.state).toBe('queued');
    expect(db.prepare(`SELECT COUNT(*) c FROM tasks WHERE job_id = 'job:changed'`).get().c).toBe(1);
  });
});

describe('makeEvaluateHandler', () => {
  function queuedJob(db, id, overrides) {
    const job = insertJob(db, id, overrides);
    db.prepare(`INSERT INTO pipeline (job_id, state, state_changed_at) VALUES (?, 'queued', ?)`).run(id, Date.now());
    return job;
  }

  test('a high score buckets the job into shortlisted and records score/evaluation_id on pipeline', async () => {
    const db = freshDb();
    queuedJob(db, 'job:1');
    evaluateMock.mockResolvedValue({ evaluation: { overallScore: 4.6, mismatches: [] }, id: 'eval:1', url: 'https://x' });

    const handler = makeEvaluateHandler({ profile: PROFILE, minimumApplyScore: 4.0 });
    await handler({ task: { job_id: 'job:1' }, db });

    const pipeline = db.prepare('SELECT * FROM pipeline WHERE job_id = ?').get('job:1');
    expect(pipeline.state).toBe('shortlisted');
    expect(pipeline.score).toBe(4.6);
    expect(pipeline.evaluation_id).toBe('eval:1');
  });

  test('a mid score buckets into maybe, a low score into skip', async () => {
    const db = freshDb();
    queuedJob(db, 'job:mid');
    queuedJob(db, 'job:low');

    evaluateMock.mockResolvedValueOnce({ evaluation: { overallScore: 3.2, mismatches: [] }, id: 'eval:mid' });
    evaluateMock.mockResolvedValueOnce({ evaluation: { overallScore: 1.5, mismatches: [] }, id: 'eval:low' });

    const handler = makeEvaluateHandler({ profile: PROFILE, minimumApplyScore: 4.0 });
    await handler({ task: { job_id: 'job:mid' }, db });
    await handler({ task: { job_id: 'job:low' }, db });

    expect(db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get('job:mid').state).toBe('maybe');
    expect(db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get('job:low').state).toBe('skip');
  });

  test('throws when the job row is missing', async () => {
    const db = freshDb();
    const handler = makeEvaluateHandler({ profile: PROFILE, minimumApplyScore: 4.0 });
    await expect(handler({ task: { job_id: 'job:ghost' }, db })).rejects.toThrow(/no job row/);
  });
});

describe('runOnce — dry-run makes no LLM calls', () => {
  test('scan runs, but nothing is enqueued and the evaluate handler is never invoked', async () => {
    const db = freshDb();
    insertJob(db, 'job:good');

    const scanStub = vi.fn().mockResolvedValue({ jobs: [], newJobs: [], closed: 0, errors: [] });
    const handlerStub = vi.fn(async () => {});

    const result = await runOnce({
      db, profile: PROFILE, dryRun: true, scan: scanStub, handlers: { evaluate: handlerStub },
    });

    expect(scanStub).toHaveBeenCalledWith(PROFILE.archetypes);
    expect(handlerStub).not.toHaveBeenCalled();
    expect(result.drainSummary.stopReason).toBe('dry_run');
    expect(db.prepare('SELECT COUNT(*) c FROM tasks').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM pipeline').get().c).toBe(0);
    expect(result.digest.markdown).toContain('Hunt-Job digest');
  });
});

describe('runOnce — non-dry-run drains with the injected handler', () => {
  test('a survivor is enqueued and drained through the stubbed evaluate handler', async () => {
    const db = freshDb();
    insertJob(db, 'job:good');

    const scanStub = vi.fn().mockResolvedValue({ jobs: [], newJobs: [], closed: 0, errors: [] });
    const handlerStub = vi.fn(async () => {});

    const result = await runOnce({
      db, profile: PROFILE, dryRun: false, scan: scanStub, handlers: { evaluate: handlerStub },
    });

    expect(scanStub).toHaveBeenCalledTimes(1);
    expect(handlerStub).toHaveBeenCalledTimes(1);
    expect(result.drainSummary.completed).toBe(1);
    expect(db.prepare(`SELECT state FROM tasks WHERE job_id = 'job:good'`).get().state).toBe('done');
  });
});
