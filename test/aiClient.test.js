import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// The Anthropic and Gemini SDK constructors are mocked so no real network call
// is ever possible; each mock's inner `create`/`generateContent` is stubbed
// per test. Groq/NVIDIA/OpenRouter go through global `fetch`, stubbed the same
// way the rest of the suite stubs it.
const anthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: anthropicCreate },
  })),
}));

const geminiGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: geminiGenerateContent },
  })),
}));

// Only anthropic + gemini are "available" for these tests — every other
// provider's key is cleared so priorityOrder resolves to exactly [anthropic, gemini].
function setProviderEnv() {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('NVIDIA_API_KEY', '');
  vi.stubEnv('AI_PROVIDER', '');
}

async function freshAiClient() {
  vi.resetModules();
  setProviderEnv();
  anthropicCreate.mockReset();
  geminiGenerateContent.mockReset();
  return import('../src/core/aiClient.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('generateJSON (B-04)', () => {
  test('parses a well-formed JSON-mode response on the first try', async () => {
    const { generateJSON } = await freshAiClient();
    anthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '"overallScore":4.5,"recommendation":"Apply"}' }], // '{' was prefilled
    });

    const { data } = await generateJSON('evaluate this job', { taskType: 'heavy' });
    expect(data).toEqual({ overallScore: 4.5, recommendation: 'Apply' });
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });

  test('makes exactly ONE repair retry on invalid JSON, then succeeds', async () => {
    const { generateJSON } = await freshAiClient();
    anthropicCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not valid json at all' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '"overallScore":3}' }] });

    const { data } = await generateJSON('evaluate this job', { taskType: 'heavy' });
    expect(data).toEqual({ overallScore: 3 });
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
  });

  test('throws a typed LLMParseError after the repair retry also fails — never a placeholder', async () => {
    const { generateJSON, LLMParseError } = await freshAiClient();
    anthropicCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'still not json' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'still garbage' }] });

    await expect(generateJSON('evaluate this job', { taskType: 'heavy' }))
      .rejects.toBeInstanceOf(LLMParseError);
    expect(anthropicCreate).toHaveBeenCalledTimes(2); // exactly one repair retry, not a retry loop
  });
});

describe('provider cooldown + failover (B-24)', () => {
  test('fails over to the next provider immediately on a 429 — no sleep first', async () => {
    const { getActiveClient } = await freshAiClient();
    anthropicCreate.mockRejectedValue(new Error('429 rate limit exceeded'));
    geminiGenerateContent.mockResolvedValue({ text: 'from-gemini' });

    const start = Date.now();
    const result = await getActiveClient('heavy').messages.create({
      messages: [{ role: 'user', content: 'hi' }],
    });
    const elapsedMs = Date.now() - start;

    expect(result.content[0].text).toBe('from-gemini');
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(geminiGenerateContent).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBeLessThan(1000); // real time — no 30-90s sleep happened
  });

  test('a provider that just 429ed is skipped on the very next call (timed cooldown, not sticky-forever)', async () => {
    const { getActiveClient } = await freshAiClient();
    anthropicCreate.mockRejectedValue(new Error('429 rate limit exceeded'));
    geminiGenerateContent.mockResolvedValue({ text: 'from-gemini' });

    const client = getActiveClient('heavy');
    await client.messages.create({ messages: [{ role: 'user', content: 'hi' }] });
    anthropicCreate.mockClear();
    geminiGenerateContent.mockClear();

    await client.messages.create({ messages: [{ role: 'user', content: 'again' }] });

    expect(anthropicCreate).not.toHaveBeenCalled(); // still cooling down — skipped, not retried
    expect(geminiGenerateContent).toHaveBeenCalledTimes(1);
  });

  test('sleeps only once every provider is cooling down, then retries after the cooldown clears', async () => {
    vi.useFakeTimers();
    const { getActiveClient } = await freshAiClient();
    anthropicCreate.mockRejectedValue(new Error('429 rate limit exceeded'));
    geminiGenerateContent.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

    const client = getActiveClient('heavy');

    // Both providers fail within this single call — it fails over between them
    // (not a sleep), then throws once both are exhausted.
    await expect(client.messages.create({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/All providers failed/);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(geminiGenerateContent).toHaveBeenCalledTimes(1);

    // Now both are cooling down. The next call must sleep before trying again.
    geminiGenerateContent.mockResolvedValue({ text: 'recovered' });
    const p = client.messages.create({ messages: [{ role: 'user', content: 'again' }] });
    await vi.advanceTimersByTimeAsync(61_000);
    const result = await p;

    expect(result.content[0].text).toBe('recovered');
  });
});

describe('settings-backed helpers (B-23)', () => {
  test('getTemperature() and getMinimumApplyScore() read config/settings.json', async () => {
    const { getTemperature, getMinimumApplyScore } = await freshAiClient();
    // Values as currently checked into config/settings.json.
    expect(getTemperature()).toBe(0.7);
    expect(getMinimumApplyScore()).toBe(4.0);
  });

  test('defaults to temperature 0 / minimumApplyScore 4.0 when settings.json omits them, without treating an explicit 0 as missing', async () => {
    vi.resetModules();
    setProviderEnv();
    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        readFileSync: (filePath, enc) =>
          String(filePath).includes('settings.json')
            ? JSON.stringify({
                providers: { priorityOrder: ['anthropic'], models: { anthropic: { heavy: 'x', light: 'y' } } },
                claude: { temperature: 0 },
              })
            : actual.readFileSync(filePath, enc),
      };
    });

    const { getTemperature, getMinimumApplyScore } = await import('../src/core/aiClient.js');
    expect(getTemperature()).toBe(0); // explicit 0 must survive (?? not ||)
    expect(getMinimumApplyScore()).toBe(4.0); // absent from this fixture — falls back
    vi.doUnmock('fs');
  });

  test('every provider call receives the configured temperature by default', async () => {
    const { getActiveClient } = await freshAiClient();
    anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    await getActiveClient('heavy').messages.create({ messages: [{ role: 'user', content: 'hi' }] });

    expect(anthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 })
    );
  });
});
