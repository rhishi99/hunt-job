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

async function geminiGenerate(ai, model, prompt, maxTokens, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model, contents: prompt, config: { maxOutputTokens: maxTokens }
      });
      return extractGeminiText(response);
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      const is503 = msg.includes('503') || msg.includes('UNAVAILABLE');
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      const isDaily = isDailyQuotaExhausted(msg);

      if (isDaily) throw new Error(`DAILY_QUOTA_EXHAUSTED: ${msg}`);

      if (attempt < retries && (is503 || is429)) {
        const suggested = parseRetryDelay(msg);
        const wait = suggested ?? (is429 ? 30000 : attempt * 5000);
        console.log(`  Gemini rate limit, waiting ${Math.round(wait / 1000)}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(msg);
    }
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
      create: async ({ max_tokens = 2048, messages, taskType = 'heavy' }) => {
        this._init();
        const model = PROVIDER_MODELS.gemini[taskType] ?? PROVIDER_MODELS.gemini.heavy;
        const prompt = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
        const text = await geminiGenerate(this._ai, model, prompt, max_tokens);
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
      create: async ({ max_tokens = 2048, messages, taskType = 'heavy' }) => {
        this._init();
        const model = PROVIDER_MODELS.anthropic[taskType] ?? PROVIDER_MODELS.anthropic.heavy;
        const response = await this._client.messages.create({
          model, max_tokens,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        });
        const text = response.content.find(b => b.type === 'text')?.text ?? '';
        return { content: [{ text }] };
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
      create: async ({ max_tokens = 2048, messages, taskType = 'heavy' }) => {
        const model = this._models[taskType] ?? this._models.heavy;
        const res = await fetch(`${this._baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this._apiKey}`,
            'Content-Type': 'application/json',
            ...this._extraHeaders,
          },
          body: JSON.stringify({ model, messages, max_tokens }),
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
const _providerHealth = {};

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
  const healthy = available.filter(p => _providerHealth[p] !== false);
  return healthy[0] ?? available[0] ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getActiveClient(taskType = 'heavy') {
  return {
    messages: {
      create: async (params) => {
        const effectiveParams = { taskType, ...params };
        const available = getAvailableProviders();
        if (!available.length) {
          throw new Error(
            'No API key found. Set one of: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, GEMINI_API_KEY'
          );
        }
        const healthy = available.filter(p => _providerHealth[p] !== false);
        const candidates = healthy.length ? healthy : available;

        let lastError;
        for (const providerName of candidates) {
          try {
            const client = getClient(providerName);
            const result = await client.messages.create(effectiveParams);
            _providerHealth[providerName] = true;
            return result;
          } catch (err) {
            console.warn(`  [AI] ${providerName} failed: ${err.message.slice(0, 100)} — trying next provider`);
            _providerHealth[providerName] = false;
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
