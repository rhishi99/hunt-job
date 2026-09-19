#!/usr/bin/env node
// `hunt-job quiz <topic>` — 5 LLM questions, user self-grades 0-2 each; the
// total (0-10) is stored in prep_sessions (docs/fable51-answers.md §7.3).
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { getDb } from '../core/db.js';
import { resolveTopic, recordSession } from '../core/prepTopics.js';

export const QUESTION_COUNT = 5;

/** @param generate (prompt, opts) => Promise<{data}> — aiClient.generateJSON, stubbed in tests */
export async function generateQuestions(label, generate) {
  const prompt = `Write ${QUESTION_COUNT} concise technical interview questions to test a candidate on "${label}". ` +
    `Return ONLY JSON: {"questions": [{"q": string, "hint": string}]}`;
  const { data } = await generate(prompt, { taskType: 'light', maxTokens: 1024, taskKind: 'quiz' });
  const qs = (data?.questions || []).filter(x => x && x.q).slice(0, QUESTION_COUNT);
  if (!qs.length) throw new Error('LLM returned no questions');
  return qs;
}

export async function runQuiz(db, input, { generate, ask, log = console.log, jobId = null } = {}) {
  const key = resolveTopic(db, input);
  if (!key) throw new Error(`Unknown topic: ${input}. Run \`hunt-job prep --plan\` to see topics.`);
  const label = db.prepare('SELECT label FROM prep_topics WHERE topic_key = ?').get(key).label;
  const qs = await generateQuestions(label, generate);
  let total = 0;
  for (const [i, q] of qs.entries()) {
    log(`\nQ${i + 1}. ${q.q}`);
    const raw = await ask(`Self-grade 0-2 (hint: ${q.hint || 'none'}): `);
    total += Math.min(2, Math.max(0, parseInt(raw, 10) || 0));
  }
  const { suggestConfident } = recordSession(db, { topicKey: key, jobId, kind: 'quiz', score: total });
  log(`\nScore ${total}/${qs.length * 2}${suggestConfident ? ' - marked confident (3 sessions >= 8/10)' : ''}`);
  return { key, total, suggestConfident };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const topic = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
  if (!topic) { console.error('Usage: hunt-job quiz <topic>'); process.exit(1); }
  const { generateJSON } = await import('../core/aiClient.js');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await runQuiz(getDb(), topic, { generate: generateJSON, ask: q => rl.question(q) });
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally { rl.close(); }
}
