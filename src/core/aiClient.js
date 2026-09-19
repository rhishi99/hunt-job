import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(
  readFileSync(path.join(__dirname, '../../config/settings.json'), 'utf-8')
);
const PROVIDER_MODELS   = settings.providers.models;
const PRIORITY_ORDER    = settings.providers.priorityOrder;

// ─── LLM call ledger hook (brief 3, §1.4) ──────────────────────────────────────
// aiClient stays decoupled from db.js/budget.js by default (no import, no
// forced DB access — tests never touch a real database as a side effect of
// exercising a provider call). A caller that owns a `db` (runner.js, a CLI
// bootstrap) wires this once via setRecordHook(entry => budget.record(db, entry)).
// The hook is best-effort: a throwing hook must never break the LLM call it's
// describing, so every invocation is wrapped in try/catch.
let _recordHook = null;

export function setRecordHook(fn) {
  _recordHook = typeof fn === 'function' ? fn : null;
}

function recordCall(entry) {
  if (!_recordHook) return;
  try {
    _recordHook(entry);
  } catch {
    // recording must never break the caller
  }
}

// classifyProviderFailure's `kind` -> llm_calls.error_class enum
// ('rate_limit' | 'daily_quota' | 'parse' | 'http').
const ERROR_CLASS_MAP = { daily_quota: 'daily_quota', rate_limit: 'rate_limit', unavailable: 'http', error: 'http' };

const PROVIDER_ENV_MAP = {
  anthropic:  'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq:       'GROQ_API_KEY',
  nvidia:     'NVIDIA_API_KEY',
  gemini:     'GEMINI_API_KEY',
};

function getAvailableProviders() {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced) {
    if (!process.env[PROVIDER_ENV_MAP[forced]]) {
      throw new Error(`AI_PROVIDER=${forced} but ${PROVIDER_ENV_MAP[forced]} is not set`);
    }
    return [forced];
  }
  return PRIORITY_ORDER.filter(p => !!process.env[PROVIDER_ENV_MAP[p]]);
}

// ─── Gemini helpers ───────────────────────────────────────────────────────────

function extractGeminiText(response) {
  if (response.text !== undefined) return response.text;
  return response.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    ?.map(p => p.text)
    ?.join('') ?? '';
}

function parseRetryDelay(msg) {
  const match = msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
  return match ? Math.ceil(parseFloat(match[1])) * 1000 : null;
}

function isDailyQuotaExhausted(msg) {
  return msg.includes('GenerateRequestsPerDayPerProjectPerModel') ||
         (msg.includes('429') && msg.includes('limit: 20'));
}

// B-24: no in-provider retry/sleep here anymore. A single failed attempt throws
// immediately so the caller (getActiveClient) can fail over to the next
// provider right away — sleeping 30-90s before ever trying another provider
// was the exact bug this replaces. Cooldown bookkeeping happens one level up.
async function geminiGenerate(ai, model, prompt, config) {
  try {
    const response = await ai.models.generateContent({ model, contents: prompt, config });
    return extractGeminiText(response);
  } catch (err) {
    const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
    if (isDailyQuotaExhausted(msg)) throw new Error(`DAILY_QUOTA_EXHAUSTED: ${msg}`);
    throw new Error(msg);
  }
}

// ─── Provider clients ─────────────────────────────────────────────────────────

class GeminiClient {
  constructor() { this._ai = null; }
  _init() {
    if (!this._ai) this._ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  get messages() {
    return {
      create: async ({ max_tokens = 2048, messages, taskType = 'heavy', temperature, json = false }) => {
        this._init();
        const model = PROVIDER_MODELS.gemini[taskType] ?? PROVIDER_MODELS.gemini.heavy;
        const prompt = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
        const config = { maxOutputTokens: max_tokens };
        if (temperature !== undefined) config.temperature = temperature;
        // B-04: native JSON mode — Gemini returns a JSON body directly, no fences to strip.
        if (json) config.responseMimeType = 'application/json';
        const text = await geminiGenerate(this._ai, model, prompt, config);
        return { content: [{ text }] };
      }
    };
  }
}

class AnthropicClient {
  constructor() { this._client = null; }
  _init() {
    if (!this._client) this._client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  get messages() {
    return {
      create: async ({ max_tokens = 2048, messages, taskType = 'heavy', temperature, json = false }) => {
        this._init();
        const model = PROVIDER_MODELS.anthropic[taskType] ?? PROVIDER_MODELS.anthropic.heavy;
        const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
        // B-04: Claude has no response-format JSON mode — prefill the assistant
        // turn with '{' so the model continues a JSON object instead of prefacing
        // it with prose. The prefill text isn't echoed back, so it's re-added below.
        if (json) apiMessages.push({ role: 'assistant', content: '{' });
        const params = { model, max_tokens, messages: apiMessages };
        if (temperature !== undefined) params.temperature = temperature;
        const response = await this._client.messages.create(params);
        let text = response.content.find(b => b.type === 'text')?.text ?? '';
        if (json) text = '{' + text;
        return {
          content: [{ text }],
          model,
          usage: { tokensIn: response.usage?.input_tokens ?? null, tokensOut: response.usage?.output_tokens ?? null },
        };
      }
    };
  }
}

// Shared base for all OpenAI-compatible providers (Groq, Nvidia NIM, OpenRouter)
class OpenAICompatibleClient {
  constructor({ apiKey, baseUrl, providerName, models, extraHeaders = {} }) {
    this._apiKey       = apiKey;
    this._baseUrl      = baseUrl;
    this._providerName = providerName;
    this._models       = models;
    this._extraHeaders = extraHeaders;
  }
  get messages() {
    return {
      create: async ({ max_tokens = 2048, messages, taskType = 'heavy', temperature, json = false }) => {
        const model = this._models[taskType] ?? this._models.heavy;
        const body = { model, messages, max_tokens };
        if (temperature !== undefined) body.temperature = temperature;
        // B-04: OpenAI-compatible JSON mode (supported by Groq + OpenRouter's
        // upstream models; providers that ignore the field just return prose,
        // which generateJSON's repair retry still handles).
        if (json) body.response_format = { type: 'json_object' };
        const res = await fetch(`${this._baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this._apiKey}`,
            'Content-Type': 'application/json',
            ...this._extraHeaders,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`${this._providerName} error ${res.status}: ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        return { content: [{ text }] };
      }
    };
  }
}

function makeGroqClient() {
  return new OpenAICompatibleClient({
    apiKey:       process.env.GROQ_API_KEY,
    baseUrl:      'https://api.groq.com/openai/v1',
    providerName: 'Groq',
    models:       PROVIDER_MODELS.groq,
  });
}

function makeNvidiaClient() {
  return new OpenAICompatibleClient({
    apiKey:       process.env.NVIDIA_API_KEY,
    baseUrl:      'https://integrate.api.nvidia.com/v1',
    providerName: 'Nvidia NIM',
    models:       PROVIDER_MODELS.nvidia,
  });
}

function makeOpenRouterClient() {
  return new OpenAICompatibleClient({
    apiKey:       process.env.OPENROUTER_API_KEY,
    baseUrl:      'https://openrouter.ai/api/v1',
    providerName: 'OpenRouter',
    models:       PROVIDER_MODELS.openrouter,
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/hunt-job',
      'X-Title':      'Hunt-Job Job Search Agent',
    },
  });
}

// ─── Provider registry ────────────────────────────────────────────────────────

const _clientCache    = {};
// B-24: was a sticky boolean for the life of the process — one 429 disabled a
// provider forever. Now a timed cooldown: `{ until: <epoch ms> }` while
// unhealthy, absent (or expired) once it's eligible again.
const _providerHealth = {};

const RATE_LIMIT_COOLDOWN_MS  = 60 * 1000;        // 429 / RESOURCE_EXHAUSTED
const UNAVAILABLE_COOLDOWN_MS = 30 * 1000;        // 503 / UNAVAILABLE
const DAILY_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000; // daily quota exhausted
const DEFAULT_COOLDOWN_MS     = 60 * 1000;        // any other provider error

function isProviderHealthy(name) {
  const h = _providerHealth[name];
  return !h || Date.now() >= h.until;
}

// B-29 wait caps (see the all-cooling-down branch in getActiveClient).
const MAX_COOLDOWN_WAIT_MS = 60_000;
const MAX_TOTAL_COOLDOWN_WAIT_MS = 5 * 60_000;
let _totalCooldownWaitMs = 0;

/** Test hook: reset the per-process cooldown wait budget. */
export function _resetCooldownWaitBudget() {
  _totalCooldownWaitMs = 0;
}

function markProviderUnhealthy(name, cooldownMs) {
  const until = Date.now() + cooldownMs;
  const existing = _providerHealth[name];
  if (!existing || until > existing.until) _providerHealth[name] = { until };
}

function markProviderHealthy(name) {
  delete _providerHealth[name];
}

// Classifies a provider failure into a cooldown duration, preferring the
// provider's own suggested retryDelay (Gemini) when one is present.
function classifyProviderFailure(err) {
  const msg = err?.message || String(err);
  if (/DAILY_QUOTA_EXHAUSTED/i.test(msg)) {
    return { cooldownMs: DAILY_QUOTA_COOLDOWN_MS, kind: 'daily_quota' };
  }
  const suggested = parseRetryDelay(msg);
  if (/\b429\b/.test(msg) || /RESOURCE_EXHAUSTED/i.test(msg) || /rate.?limit/i.test(msg)) {
    return { cooldownMs: suggested ?? RATE_LIMIT_COOLDOWN_MS, kind: 'rate_limit' };
  }
  if (/\b503\b/.test(msg) || /UNAVAILABLE/i.test(msg)) {
    return { cooldownMs: suggested ?? UNAVAILABLE_COOLDOWN_MS, kind: 'unavailable' };
  }
  return { cooldownMs: DEFAULT_COOLDOWN_MS, kind: 'error' };
}

function buildClient(providerName) {
  switch (providerName) {
    case 'anthropic':  return new AnthropicClient();
    case 'openrouter': return makeOpenRouterClient();
    case 'groq':       return makeGroqClient();
    case 'nvidia':     return makeNvidiaClient();
    case 'gemini':     return new GeminiClient();
    default: throw new Error(`Unknown provider: ${providerName}`);
  }
}

function getClient(providerName) {
  if (!_clientCache[providerName]) {
    _clientCache[providerName] = buildClient(providerName);
  }
  return _clientCache[providerName];
}

export function getActiveProviderName() {
  const available = getAvailableProviders();
  const healthy = available.filter(isProviderHealthy);
  return healthy[0] ?? available[0] ?? null;
}

// ─── Settings-backed config (B-23) ─────────────────────────────────────────────

/** Reproducible-by-default temperature for every provider call. */
export function getTemperature() {
  return settings.claude?.temperature ?? 0;
}

/** Shared minimum-apply-score threshold — single source of truth for CLI/flows. */
export function getMinimumApplyScore() {
  return settings.evaluation?.minimumApplyScore ?? 4.0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getActiveClient(taskType = 'heavy') {
  return {
    messages: {
      create: async (params) => {
        // B-23: every provider call gets a temperature unless the caller
        // explicitly overrides it.
        const effectiveParams = { taskType, temperature: getTemperature(), ...params };
        const available = getAvailableProviders();
        if (!available.length) {
          throw new Error(
            'No API key found. Set one of: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, GEMINI_API_KEY'
          );
        }

        // B-24: fail over across healthy providers first, with no sleep at all.
        // Only when EVERY candidate is already cooling down do we wait — and
        // only until the earliest cooldown clears — before trying again.
        let candidates = available.filter(isProviderHealthy);
        if (!candidates.length) {
          const earliestUntil = Math.min(...available.map(p => _providerHealth[p]?.until ?? Date.now()));
          const waitMs = Math.max(0, earliestUntil - Date.now());
          // B-29: cap the wait — per attempt and cumulatively per process — so a
          // spent quota fails the task (the queue retries later) instead of
          // pinning a scheduled run for the whole task limit.
          if (waitMs > MAX_COOLDOWN_WAIT_MS || _totalCooldownWaitMs + waitMs > MAX_TOTAL_COOLDOWN_WAIT_MS) {
            throw new Error(
              `All providers cooling down (earliest clears in ${Math.round(waitMs / 1000)}s) — not waiting; try again later`
            );
          }
          if (waitMs > 0) {
            _totalCooldownWaitMs += waitMs;
            console.warn(`  [AI] All providers cooling down — waiting ${Math.round(waitMs / 1000)}s`);
            await new Promise(r => setTimeout(r, waitMs));
          }
          candidates = available.filter(isProviderHealthy);
          if (!candidates.length) candidates = available; // clock nudge — try anyway rather than give up
        }

        let lastError;
        for (const providerName of candidates) {
          const startedAt = Date.now();
          try {
            const client = getClient(providerName);
            const result = await client.messages.create(effectiveParams);
            markProviderHealthy(providerName);
            recordCall({
              provider: providerName,
              model: result?.model ?? PROVIDER_MODELS[providerName]?.[taskType] ?? null,
              taskKind: effectiveParams.taskKind ?? null,
              ok: true,
              tokensIn: result?.usage?.tokensIn ?? null,
              tokensOut: result?.usage?.tokensOut ?? null,
              ms: Date.now() - startedAt,
            });
            return result;
          } catch (err) {
            const { cooldownMs, kind } = classifyProviderFailure(err);
            console.warn(`  [AI] ${providerName} failed (${kind}): ${err.message.slice(0, 100)} — trying next provider`);
            markProviderUnhealthy(providerName, cooldownMs);
            recordCall({
              provider: providerName,
              model: PROVIDER_MODELS[providerName]?.[taskType] ?? null,
              taskKind: effectiveParams.taskKind ?? null,
              ok: false,
              errorClass: ERROR_CLASS_MAP[kind] ?? 'http',
              ms: Date.now() - startedAt,
            });
            lastError = err;
          }
        }
        throw new Error(`All providers failed. Last error: ${lastError?.message}`);
      }
    }
  };
}

// Backward-compat alias
export function createClient() {
  return getActiveClient('heavy');
}

// ─── JSON mode (B-04) ───────────────────────────────────────────────────────────

/**
 * Thrown by generateJSON when the model's output still isn't valid JSON after
 * one repair retry. Callers must let this propagate (or handle it explicitly)
 * — never catch-and-persist a placeholder (score 0, {}, empty plan) in its place.
 */
export class LLMParseError extends Error {
  constructor(message, { raw } = {}) {
    super(message);
    this.name = 'LLMParseError';
    this.raw = raw;
  }
}

function stripJsonFences(text) {
  return (text || '').replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
}

function extractJson(text) {
  const stripped = stripJsonFences(text).trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // fall through — try to salvage a JSON block from surrounding prose
  }
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* try the array form below */ }
  }
  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    return JSON.parse(arrMatch[0]); // let this throw if it's still bad — caller handles it
  }
  throw new Error('No valid JSON object or array found in response');
}

/**
 * Generates JSON from the active provider, using provider-native JSON mode
 * where supported (Gemini responseMimeType, OpenAI-compatible response_format,
 * Claude assistant-prefill). On a parse failure, makes exactly ONE repair retry
 * — asking the model to fix its own invalid output — then throws LLMParseError.
 *
 * @returns {Promise<{data: any, raw: string}>}
 */
export async function generateJSON(prompt, opts = {}) {
  const { taskType = 'heavy', maxTokens = 2048, temperature, taskKind } = opts;
  const client = getActiveClient(taskType);
  const params = { max_tokens: maxTokens, json: true, messages: [{ role: 'user', content: prompt }] };
  if (temperature !== undefined) params.temperature = temperature;
  if (taskKind !== undefined) params.taskKind = taskKind;

  const first = await client.messages.create(params);
  const firstText = first.content[0]?.text ?? '';
  try {
    return { data: extractJson(firstText), raw: firstText };
  } catch (firstErr) {
    console.warn(`  [AI] JSON parse failed, attempting one repair retry: ${firstErr.message}`);
    const repairPrompt = `The following model output was supposed to be valid JSON but failed to parse (${firstErr.message}).\n\n---\n${firstText}\n---\n\nReturn ONLY the corrected, valid JSON. No markdown fences, no commentary, no explanation.`;
    const second = await client.messages.create({ ...params, messages: [{ role: 'user', content: repairPrompt }] });
    const secondText = second.content[0]?.text ?? '';
    try {
      return { data: extractJson(secondText), raw: secondText };
    } catch (secondErr) {
      recordCall({
        provider: getActiveProviderName() ?? 'unknown',
        taskKind: taskKind ?? null,
        ok: false,
        errorClass: 'parse',
      });
      throw new LLMParseError(
        `LLM did not return valid JSON after one repair retry: ${secondErr.message}`,
        { raw: secondText }
      );
    }
  }
}

export async function testConnection(providerName = null) {
  const target = providerName ?? getActiveProviderName();
  if (!target) throw new Error('No provider available — set at least one API key in .env');
  console.log(`  Provider: ${target} (${PROVIDER_MODELS[target]?.light ?? 'unknown model'})`);
  const client = getClient(target);
  const response = await client.messages.create({
    max_tokens: 20,
    taskType: 'light',
    messages: [{ role: 'user', content: 'Reply with exactly: "Hunt-Job connected"' }],
  });
  return response.content[0].text?.trim();
}

export async function testAllProviders() {
  const available = getAvailableProviders();
  const results = {};
  for (const name of available) {
    try {
      const result = await testConnection(name);
      results[name] = { ok: true, response: result };
    } catch (err) {
      results[name] = { ok: false, error: err.message };
    }
  }
  return results;
}
