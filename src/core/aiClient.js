import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// ─── Provider detection ───────────────────────────────────────────────────────
// Priority: AI_PROVIDER env override → GROQ_API_KEY → ANTHROPIC_API_KEY → GEMINI_API_KEY

function detectProvider() {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced) return forced;
  if (process.env.GROQ_API_KEY)       return 'groq';
  if (process.env.ANTHROPIC_API_KEY)  return 'anthropic';
  if (process.env.GEMINI_API_KEY)     return 'gemini';
  throw new Error('No API key found. Set GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in .env');
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

function isDailyQuotaExhausted(msg) {
  return msg.includes('GenerateRequestsPerDayPerProjectPerModel') ||
         (msg.includes('429') && msg.includes('limit: 20'));
}

async function resolveGeminiModel(ai) {
  if (_geminiModelCache) return _geminiModelCache;
  for (const model of GEMINI_MODELS) {
    try {
      const r = await ai.models.generateContent({ model, contents: 'hi', config: { maxOutputTokens: 5 } });
      if (extractGeminiText(r) !== undefined) { _geminiModelCache = model; return model; }
    } catch (e) {
      if (isDailyQuotaExhausted(e?.message || '')) break; // No point trying other models
    }
  }
  _geminiModelCache = GEMINI_MODELS[0];
  return _geminiModelCache;
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

class GeminiClient {
  constructor() { this._ai = null; }
  _init() {
    if (!this._ai) this._ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

// ─── Groq client (OpenAI-compatible, free 100 RPD) ────────────────────────────

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

class GroqClient {
  get messages() {
    return {
      create: async ({ max_tokens = 2048, messages }) => {
        const res = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens }),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Groq error ${res.status}: ${err.slice(0, 200)}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        return { content: [{ text }] };
      }
    };
  }
}

// ─── Anthropic client ─────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

class AnthropicClient {
  constructor() { this._client = null; }
  _init() {
    if (!this._client) this._client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  get messages() {
    return {
      create: async ({ max_tokens = 2048, messages }) => {
        this._init();
        const response = await this._client.messages.create({
          model: ANTHROPIC_MODEL, max_tokens,
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
  if (provider === 'groq')      return new GroqClient();
  if (provider === 'anthropic') return new AnthropicClient();
  return new GeminiClient();
}

export async function testConnection() {
  const provider = detectProvider();
  console.log(`  Provider: ${provider}`);
  const client = createClient();
  const response = await client.messages.create({
    max_tokens: 20,
    messages: [{ role: 'user', content: 'Reply with exactly: "Career-Ops connected"' }],
  });
  return response.content[0].text?.trim();
}
