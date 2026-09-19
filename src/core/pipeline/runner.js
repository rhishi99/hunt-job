// Queue drain loop — docs/fable51-answers.md §1.6, §1.7.
//
// `drain()` is the body of `hunt-job run` (a later brief owns the CLI entry
// point and the real per-kind handlers). It claims one task at a time,
// dispatches it to an injected handler, and stops on any of: budget
// exhausted for every remaining kind, every provider cooling down, no
// runnable work, or `maxTasks` reached. Nothing here is a long-running
// daemon — one drain() call is one bounded pass, safe to run from a
// scheduled task (§1.1).
import { claim, complete, fail, releaseStale } from './queue.js';
import { remaining, isMetered } from './budget.js';
import { getActiveProviderName } from '../aiClient.js';
import { getDb } from '../db.js';

/** No-op handler kept only so tests/CLI wiring have something to fall back to; real handlers land in brief 5. */
export const defaultHandlers = {
  noop: async () => {},
};

function parsePayload(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // not JSON — hand back the raw string rather than throw
  }
}

/**
 * Drains the queue: claim -> handler -> complete/fail, until a stop
 * condition is hit. A handler signals a non-failure outcome by throwing an
 * Error with `.errorClass` set to 'daily_quota' or 'rate_limit' (§1.3/§1.7)
 * — those park the task via queue.fail() without counting as a real failure
 * or exhausting `attempts` toward 'blocked'. Any other thrown error is a
 * genuine failure.
 *
 * @param {{db?: import('better-sqlite3').Database, handlers?: Record<string, Function>,
 *   maxTasks?: number, now?: number}} [opts]
 * @returns {{claimed: number, completed: number, deferred: number, blocked: number,
 *   failed: number, stopReason: string}}
 */
export async function drain({ db = getDb(), handlers = {}, maxTasks = Infinity, now = Date.now() } = {}) {
  releaseStale(db, { now });

  const summary = { claimed: 0, completed: 0, deferred: 0, blocked: 0, failed: 0, stopReason: null };
  const exhaustedKinds = new Set();

  while (summary.claimed < maxTasks) {
    if (getActiveProviderName() === null) {
      summary.stopReason = 'providers_cooling_down';
      break;
    }

    const task = claim(db, { now, excludeKinds: [...exhaustedKinds] });
    if (!task) {
      summary.stopReason = exhaustedKinds.size > 0 ? 'budget_exhausted' : 'no_work';
      break;
    }
    summary.claimed++;

    if (isMetered(task.kind) && remaining(db, task.kind, { now }) <= 0) {
      exhaustedKinds.add(task.kind);
      fail(db, task.id, { errorClass: 'daily_quota', message: `budget exhausted for kind "${task.kind}"`, now });
      summary.deferred++;
      continue;
    }

    const handler = handlers[task.kind] ?? defaultHandlers[task.kind] ?? defaultHandlers.noop;

    try {
      await handler({ task: { ...task, payload: parsePayload(task.payload) }, db, now });
      complete(db, task.id, { now });
      summary.completed++;
    } catch (err) {
      const errorClass = err?.errorClass ?? null;
      const outcome = fail(db, task.id, { errorClass, message: err?.message, now });
      if (errorClass === 'daily_quota') {
        exhaustedKinds.add(task.kind);
        summary.deferred++;
      } else if (errorClass === 'rate_limit') {
        summary.deferred++;
      } else if (outcome.state === 'blocked') {
        summary.blocked++;
      } else {
        summary.failed++;
      }
    }
  }

  if (!summary.stopReason) summary.stopReason = 'max_tasks';
  return summary;
}
