import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/core/db.js';
import { deriveTopics, listTopics, setProgress, recordSession, renderPlan, resolveTopic } from '../src/core/prepTopics.js';
import { runQuiz } from '../src/cli/quiz.js';
import { runPrep } from '../src/cli/prepChecklist.js';

const profile = { techStack: ['Docker', 'AWS'], skillGroups: {}, experience: [] };
let db;

function addJob(id, state, score, facts) {
  db.prepare(`INSERT INTO jobs (id, company_id, ats_platform, title, status, first_seen_at, last_seen_at)
    VALUES (?, 'Acme', 'greenhouse', 'R', 'active', 0, 0)`).run(id);
  db.prepare('INSERT INTO pipeline (job_id, state, state_changed_at, score) VALUES (?, ?, 1, ?)').run(id, state, score);
  db.prepare(`INSERT INTO evaluations (id, evaluation, evaluated_at, job_id, extraction) VALUES (?, '{}', '2026-01-01', ?, ?)`)
    .run('e_' + id, id, JSON.stringify(facts));
}
const skills = (...v) => ({ must_have_skills: v.map(value => ({ value })), seniority: { value: 'senior' } });

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  addJob('a', 'shortlisted', 4, skills('Docker', 'Kubernetes', 'Go'));
  addJob('b', 'applied', 5, { ...skills('Kubernetes'), seniority: { value: 'staff' } });
  addJob('c', 'skip', 5, skills('Rust'));
});

describe('deriveTopics', () => {
  test('gaps only, weighted, from active states', () => {
    deriveTopics(db, profile);
    const t = Object.fromEntries(listTopics(db).map(x => [x.topic_key, x]));
    expect(Object.keys(t).sort()).toEqual(['go', 'kubernetes', 'system_design']);
    expect(t.kubernetes.weight).toBeCloseTo(0.8 + 1);
    expect(t.kubernetes.jobs.sort()).toEqual(['a', 'b']);
    expect(listTopics(db, { jobId: 'a' }).map(x => x.topic_key).sort()).toEqual(['go', 'kubernetes']);
  });

  test('job leaving active states drops its topics, keeps progress of live ones', () => {
    deriveTopics(db, profile);
    setProgress(db, 'kubernetes', { status: 'practicing', rating: 2 });
    db.prepare("UPDATE pipeline SET state = 'skip' WHERE job_id = 'a'").run();
    deriveTopics(db, profile);
    expect(listTopics(db).map(x => x.topic_key).sort()).toEqual(['kubernetes', 'system_design']);
    expect(listTopics(db).find(x => x.topic_key === 'kubernetes').status).toBe('practicing');
  });
});

describe('progress + sessions', () => {
  test('validation and confident promotion after 3 good quizzes', () => {
    deriveTopics(db, profile);
    expect(() => setProgress(db, 'go', { status: 'nope' })).toThrow();
    expect(() => setProgress(db, 'nope', { status: 'todo' })).toThrow();
    for (let i = 0; i < 2; i++) expect(recordSession(db, { topicKey: 'go', score: 9 }).suggestConfident).toBe(false);
    expect(recordSession(db, { topicKey: 'go', score: 8 }).suggestConfident).toBe(true);
    expect(listTopics(db).find(x => x.topic_key === 'go').status).toBe('confident');
    expect(renderPlan(db)).toContain('[x] **Go**');
  });
});

describe('quiz (stubbed LLM)', () => {
  test('records a session with the summed self-grade', async () => {
    deriveTopics(db, profile);
    const generate = async () => ({ data: { questions: [{ q: 'q1', hint: 'h' }, { q: 'q2' }] } });
    const answers = ['2', '1'];
    const r = await runQuiz(db, 'Kubernetes', { generate, ask: async () => answers.shift(), log: () => {} });
    expect(r.total).toBe(3);
    expect(db.prepare('SELECT score, kind FROM prep_sessions WHERE topic_key = ?').get('kubernetes')).toEqual({ score: 3, kind: 'quiz' });
    await expect(runQuiz(db, 'zzz', { generate, ask: async () => '0', log: () => {} })).rejects.toThrow(/Unknown topic/);
  });
});

describe('prep CLI', () => {
  test('lists and ticks a topic without touching the profile file', async () => {
    const out = [];
    const log = s => out.push(s);
    await runPrep(['a'], { db, loadProfile: () => profile, log });
    expect(out.join('\n')).toMatch(/kubernetes/);
    await runPrep(['a', '--tick', 'kubernetes'], { db, loadProfile: () => profile, log });
    expect(listTopics(db).find(x => x.topic_key === 'kubernetes').status).toBe('practicing');
    expect(resolveTopic(db, 'Kubernetes')).toBe('kubernetes');
  });
});
