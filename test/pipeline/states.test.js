import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/core/db.js';
import { transition, isLegalTransition, STATES, ACTORS } from '../../src/core/pipeline/states.js';

function freshDb() {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare(`INSERT INTO jobs (id, company_id, ats_platform, title) VALUES ('job:1', 'acme', 'greenhouse', 'SWE')`).run();
  return db;
}

describe('isLegalTransition (pure)', () => {
  test('accepts a known edge with an authorized actor', () => {
    expect(isLegalTransition(null, 'discovered', ACTORS.SCAN)).toBe(true);
    expect(isLegalTransition('evaluated', 'shortlisted', ACTORS.PIPELINE)).toBe(true);
  });

  test('rejects a known edge with the wrong actor', () => {
    expect(isLegalTransition('evaluated', 'shortlisted', ACTORS.CLI)).toBe(false);
  });

  test('rejects an edge that does not exist', () => {
    expect(isLegalTransition('discovered', 'offer', ACTORS.PIPELINE)).toBe(false);
  });

  test('withdrawn/archived are reachable from every state by a user actor', () => {
    for (const s of STATES) {
      expect(isLegalTransition(s, 'withdrawn', ACTORS.CLI)).toBe(true);
      expect(isLegalTransition(s, 'archived', ACTORS.DASHBOARD)).toBe(true);
    }
  });
});

describe('transition() against a real DB', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });

  test('first entry inserts the pipeline row and an audit event', () => {
    const row = transition(db, 'job:1', 'discovered', { actor: 'scan', reason: 'scan found it' });
    expect(row.state).toBe('discovered');

    const events = db.prepare('SELECT * FROM pipeline_events WHERE job_id = ?').all('job:1');
    expect(events).toHaveLength(1);
    expect(events[0].from_state).toBeNull();
    expect(events[0].to_state).toBe('discovered');
    expect(events[0].actor).toBe('scan');
    expect(events[0].reason).toBe('scan found it');
  });

  test('a legal chain updates state each time and appends one event per hop', () => {
    transition(db, 'job:1', 'discovered', { actor: 'scan' });
    transition(db, 'job:1', 'queued', { actor: 'pipeline' });
    transition(db, 'job:1', 'evaluated', { actor: 'pipeline' });
    const row = transition(db, 'job:1', 'shortlisted', { actor: 'pipeline' });

    expect(row.state).toBe('shortlisted');
    expect(db.prepare('SELECT count(*) c FROM pipeline WHERE job_id = ?').get('job:1').c).toBe(1);
    expect(db.prepare('SELECT count(*) c FROM pipeline_events WHERE job_id = ?').get('job:1').c).toBe(4);
  });

  test('illegal transition throws and writes nothing', () => {
    transition(db, 'job:1', 'discovered', { actor: 'scan' });
    expect(() => transition(db, 'job:1', 'interview', { actor: 'pipeline' })).toThrow(/illegal transition/);

    // still in 'discovered', still only the one event from the first call
    expect(db.prepare('SELECT state FROM pipeline WHERE job_id = ?').get('job:1').state).toBe('discovered');
    expect(db.prepare('SELECT count(*) c FROM pipeline_events WHERE job_id = ?').get('job:1').c).toBe(1);
  });

  test('legal edge with an unauthorized actor throws', () => {
    transition(db, 'job:1', 'discovered', { actor: 'scan' });
    transition(db, 'job:1', 'queued', { actor: 'pipeline' });
    transition(db, 'job:1', 'evaluated', { actor: 'pipeline' });
    // evaluated -> shortlisted is a real edge, but only actor 'pipeline' may take it
    expect(() => transition(db, 'job:1', 'shortlisted', { actor: 'user:cli' })).toThrow(/illegal transition/);
  });

  test('rejected -> queued (re-apply) is legal for a user actor', () => {
    transition(db, 'job:1', 'discovered', { actor: 'scan' });
    transition(db, 'job:1', 'queued', { actor: 'pipeline' });
    transition(db, 'job:1', 'evaluated', { actor: 'pipeline' });
    transition(db, 'job:1', 'shortlisted', { actor: 'pipeline' });
    transition(db, 'job:1', 'applying', { actor: 'user:cli' });
    transition(db, 'job:1', 'applied', { actor: 'user:cli' });
    transition(db, 'job:1', 'rejected', { actor: 'inbox' });
    const row = transition(db, 'job:1', 'queued', { actor: 'user:cli', reason: 're-apply after 90 days' });
    expect(row.state).toBe('queued');
  });

  test('unknown state or missing actor/jobId throw before touching the DB', () => {
    expect(() => transition(db, 'job:1', 'not-a-real-state', { actor: 'scan' })).toThrow();
    expect(() => transition(db, 'job:1', 'discovered', {})).toThrow();
    expect(() => transition(db, null, 'discovered', { actor: 'scan' })).toThrow();
  });
});
