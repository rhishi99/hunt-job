// LLM call budget — docs/fable51-answers.md §1.4.
//
// The `llm_calls` table (migration v5, src/core/db.js) is the ledger; this
// module is the read (remaining) and write (record) side of it. Same
// convention as ./queue.js: `db` is an explicit first param, no getDb()
// import here, so it stays independently testable and has no import-cycle
// risk with db.js or aiClient.js.
//
// §8 assumption 3: the settings.json `budget.daily` numbers below are
// placeholders (150/25/25/30) until a week of real `llm_calls` rows makes the
// actual provider caps visible. `config/settings.json` carries the same
// defaults so `hunt-job budget` (a later brief) has something to print
// against; this module's DEFAULT_DAILY is the fallback when settings.json
// omits the block entirely (or a field within it).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, '../../../config/settings.json');

const DEFAULT_DAILY = { evaluate: 150, tailor: 25, prep: 25, inbox: 30 };
const DEFAULT_RESERVE = 0.2;

function loadSettings() {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/** `{ daily: {evaluate,tailor,prep,inbox}, reserve }`, settings.json values over the defaults above. */
export function getBudgetConfig() {
  const settings = loadSettings();
  return {
    daily: { ...DEFAULT_DAILY, ...(settings.budget?.daily || {}) },
    reserve: settings.budget?.reserve ?? DEFAULT_RESERVE,
  };
}

/** A kind only has a daily cap if it's LLM-consuming (evaluate/tailor/prep/inbox); 'hydrate' etc. are unmetered. */
export function isMetered(kind) {
  return kind in getBudgetConfig().daily;
}

function startOfTodayMs(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Count of today's llm_calls rows for `kind` (ok + failed both count — a failed call still spent the request). */
export function usedToday(db, kind, { now = Date.now() } = {}) {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM llm_calls WHERE task_kind = ? AND at >= ?`)
    .get(kind, startOfTodayMs(now));
  return row.c;
}

/** Daily cap for `kind` minus today's usage. Unmetered kinds return Infinity; never negative for metered ones. */
export function remaining(db, kind, { now = Date.now() } = {}) {
  const { daily } = getBudgetConfig();
  if (!(kind in daily)) return Infinity;
  return Math.max(0, daily[kind] - usedToday(db, kind, { now }));
}

/**
 * Writes one row to the llm_calls ledger. Never throws — a budget-recording
 * failure must not break the LLM call it's describing (aiClient's record
 * hook relies on this). Returns true if a row was written.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{provider: string, model?: string, taskKind: string, ok: boolean,
 *   errorClass?: 'rate_limit'|'daily_quota'|'parse'|'http'|null,
 *   tokensIn?: number, tokensOut?: number, ms?: number, at?: number}} entry
 */
export function record(db, entry) {
  if (!db || !entry) return false;
  const {
    provider,
    model = null,
    taskKind,
    ok,
    errorClass = null,
    tokensIn = null,
    tokensOut = null,
    ms = null,
    at = Date.now(),
  } = entry;
  if (!provider || !taskKind) return false;
  try {
    db.prepare(
      `INSERT INTO llm_calls (at, provider, model, task_kind, ok, error_class, tokens_in, tokens_out, ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(at, provider, model, taskKind, ok ? 1 : 0, errorClass, tokensIn, tokensOut, ms);
    return true;
  } catch {
    return false;
  }
}
