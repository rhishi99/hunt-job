import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// ─── Provider detection ───────────────────────────────────────────────────────
// Uses GEMINI_API_KEY if set, otherwise falls back to ANTHROPIC_API_KEY.
// Override by setting AI_PROVIDER=anthropic|gemini in .env

function detectProvider() {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === 'anthropic') return 'anthropic';
  if (forced === 'gemini') return 'gemini';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  throw new Error('No API key found. Set GEMINI_API_KEY or ANTHROPIC_API_KEY in .env');
}

// ─── Gemini client ────────────────────────────────────────────────────────────

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
let _geminiModelCache = null;

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

async function resolveGeminiModel(ai) {
  if (_geminiModelCache) return _geminiModelCache;
  for (const model of GEMINI_MODELS) {
    try {
      const r = await ai.models.generateContent({ model, contents: 'hi', config: { maxOutputTokens: 5 } });
      const text = extractGeminiText(r);
      if (text !== undefined) { _geminiModelCache = model; return model; }
    } catch {}
  }
  _geminiModelCache = GEMINI_MODELS[0];
  return _geminiModelCache;
}

async function geminiGenerate(ai, model, prompt, maxTokens, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model, contents: prompt, config: { maxOutputTokens: maxTokens }
      });
      return extractGeminiText(response);
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      const is503 = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      if (attempt < retries && (is503 || is429)) {
        const suggested = parseRetryDelay(msg);
        const wait = suggested ?? (is429 ? 60000 : attempt * 5000);
        console.log(`  Gemini rate limit, waiting ${Math.round(wait / 1000)}s... (attempt ${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(msg);
    }
  }
}

class GeminiClient {
  constructor() { this._ai = null; }

  _init() {
    if (!this._ai) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY not set. Run: npm run setup');
      this._ai = new GoogleGenAI({ apiKey: key });
    }
  }

  get messages() {
    return {
      create: async ({ max_tokens = 2048, messages }) => {
        this._init();
        const model = await resolveGeminiModel(this._ai);
        const prompt = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
        const text = await geminiGenerate(this._ai, model, prompt, max_tokens);
        return { content: [{ text }] };
      }
    };
  }
}

// ─── Anthropic client (thin wrapper for same interface) ───────────────────────

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'; // cheapest model for scanning

class AnthropicClient {
  constructor() { this._client = null; }

  _init() {
    if (!this._client) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('ANTHROPIC_API_KEY not set. Run: npm run setup');
      this._client = new Anthropic({ apiKey: key });
    }
  }

  get messages() {
    return {
      create: async ({ max_tokens = 2048, messages }) => {
        this._init();
        const response = await this._client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        });
        const text = response.content.find(b => b.type === 'text')?.text ?? '';
        return { content: [{ text }] };
      }
    };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function createClient() {
  const provider = detectProvider();
  return provider === 'anthropic' ? new AnthropicClient() : new GeminiClient();
}

export async function testConnection() {
  const provider = detectProvider();
  const client = createClient();
  console.log(`  Provider: ${provider}`);
  const response = await client.messages.create({
    max_tokens: 20,
    messages: [{ role: 'user', content: 'Reply with exactly: "Career-Ops connected"' }],
  });
  return response.content[0].text?.trim();
}
