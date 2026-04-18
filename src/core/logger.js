import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../data/logs');

function ensureLogsDir() {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

function write(level, module, event, data = {}) {
  ensureLogsDir();
  const entry = {
    ts: new Date().toISOString(),
    level,
    module,
    event,
    ...data,
  };
  const dateStr = entry.ts.slice(0, 10);
  const logFile = path.join(logsDir, `${dateStr}.jsonl`);
  try {
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {}
}

export function createLogger(module) {
  return {
    info:  (event, data) => write('INFO',  module, event, data),
    warn:  (event, data) => write('WARN',  module, event, data),
    error: (event, data) => write('ERROR', module, event, data),
    op:    (event, data) => write('OP',    module, event, data),
  };
}

export async function readLogs(date = null) {
  ensureLogsDir();
  const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.jsonl'));
  const target = date || files.sort().at(-1);
  if (!target) return [];
  const file = path.join(logsDir, target.endsWith('.jsonl') ? target : `${target}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

export async function getErrors(date = null) {
  const logs = await readLogs(date);
  return logs.filter(l => l.level === 'ERROR');
}
