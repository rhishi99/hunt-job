import { describe, test, expect, vi, beforeEach } from 'vitest';

const generateJSON = vi.fn();
vi.mock('../../src/core/aiClient.js', () => ({ generateJSON: (...args) => generateJSON(...args) }));

let extractFacts, buildExtractionPrompt, emptyFacts, mergeFacts;

beforeEach(async () => {
  vi.resetModules();
  generateJSON.mockReset();
  ({ extractFacts, buildExtractionPrompt, emptyFacts, mergeFacts } = await import('../../src/core/scoring/extract.js'));
});

describe('emptyFacts / mergeFacts', () => {
  test('emptyFacts has every field unstated/null, never undefined', () => {
    const facts = emptyFacts();
    expect(facts.seniority.value).toBe('unstated');
    expect(facts.must_have_skills).toEqual([]);
    expect(facts.signals.night_shift).toBe(false);
    expect(facts.signals.evidence).toEqual({});
  });

  test('mergeFacts fills a partial LLM response onto the defaults', () => {
    const merged = mergeFacts(emptyFacts(), {
      role_title: { value: 'SRE', evidence: 'SRE' },
      must_have_skills: [{ value: 'AWS', evidence: 'AWS' }],
    });
    expect(merged.role_title.value).toBe('SRE');
    expect(merged.must_have_skills).toEqual([{ value: 'AWS', evidence: 'AWS' }]);
    // untouched fields keep their default shape
    expect(merged.seniority.value).toBe('unstated');
    expect(merged.location.mode).toBe('unstated');
  });

  test('mergeFacts survives a malformed/non-object response', () => {
    expect(mergeFacts(emptyFacts(), null)).toEqual(emptyFacts());
    expect(mergeFacts(emptyFacts(), 'not json')).toEqual(emptyFacts());
  });

  test('mergeFacts merges signals.evidence keys individually', () => {
    const merged = mergeFacts(emptyFacts(), { signals: { on_call: true, evidence: { on_call: 'on-call rotation' } } });
    expect(merged.signals.on_call).toBe(true);
    expect(merged.signals.evidence.on_call).toBe('on-call rotation');
    expect(merged.signals.night_shift).toBe(false); // untouched signal keeps its default
  });
});

describe('buildExtractionPrompt', () => {
  test('includes the JD text and the required JSON shape', () => {
    const prompt = buildExtractionPrompt('We need a backend engineer with AWS experience.');
    expect(prompt).toContain('We need a backend engineer with AWS experience.');
    expect(prompt).toContain('must_have_skills');
    expect(prompt).toContain('evidence');
  });

  test('truncates very long JD text', () => {
    const long = 'x'.repeat(20000);
    const prompt = buildExtractionPrompt(long);
    expect(prompt.length).toBeLessThan(20000 + 2000); // prompt overhead only, not the full 20k body
  });
});

describe('extractFacts', () => {
  test('calls generateJSON with temperature 0 and merges the result onto defaults', async () => {
    generateJSON.mockResolvedValue({
      data: { role_title: { value: 'DevOps Engineer', evidence: 'DevOps Engineer' } },
      raw: '{}',
    });

    const { facts } = await extractFacts('DevOps Engineer role at Acme.', { taskType: 'light' });

    expect(generateJSON).toHaveBeenCalledTimes(1);
    const [, opts] = generateJSON.mock.calls[0];
    expect(opts.temperature).toBe(0);
    expect(opts.taskType).toBe('light');
    expect(facts.role_title.value).toBe('DevOps Engineer');
    expect(facts.must_have_skills).toEqual([]); // default, not present in the stubbed response
  });

  test('propagates a generateJSON failure (e.g. LLMParseError) instead of swallowing it', async () => {
    generateJSON.mockRejectedValue(new Error('LLM did not return valid JSON'));
    await expect(extractFacts('some JD text')).rejects.toThrow(/valid JSON/);
  });
});
