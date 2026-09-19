import { describe, it, expect } from 'vitest';
import { buildAnswers, answerForQuestion } from '../src/core/autoFill/profileMapper.js';
import { fillCustomQuestions } from '../src/core/autoFill/adapters/greenhouseAdapter.js';

const answers = buildAnswers({
  applicationAnswers: { country: 'India', noticePeriod: '60 days', currentCtc: '35 LPA', expectedCtc: '50 LPA' },
});

describe('buildAnswers (B-30)', () => {
  it('never invents an answer the profile does not hold', () => {
    const a = buildAnswers({});
    expect(Object.values(a).every(v => v === '')).toBe(true);
  });
});

describe('answerForQuestion (B-30)', () => {
  it.each([
    ['Country', 'India'],
    ['What is your notice period?', '60 days'],
    ['Current CTC (LPA)', '35 LPA'],
    ['Expected salary', '50 LPA'],
    ['Desired compensation', '50 LPA'],
  ])('%s -> %s', (label, expected) => {
    expect(answerForQuestion(label, answers)).toBe(expected);
  });

  it('returns empty for unknown or unanswered questions', () => {
    expect(answerForQuestion('Why do you want to work here?', answers)).toBe('');
    expect(answerForQuestion('Are you authorized to work in India?', answers)).toBe(''); // not in profile
    expect(answerForQuestion('Expected start date', answers)).toBe('');
  });
});

// Minimal stand-in for a Playwright element handle.
function fakeEl({ label, tag = 'input', value = '', required = false }) {
  const el = {
    filled: null,
    isVisible: async () => true,
    isEditable: async () => true,
    click: async () => {},
    press: async () => {},
    getAttribute: async () => null,
    fill: async v => { el.filled = v; },
    selectOption: async () => { el.filled = 'selected'; },
    evaluate: async fn => {
      const src = String(fn);
      if (src.includes('tagName.toLowerCase')) return tag;
      if (src.includes('required')) return required;
      if (src.includes('CSS.escape')) return label;
      return value;
    },
  };
  return el;
}

describe('fillCustomQuestions (B-30)', () => {
  it('fills known questions, reports required unknown ones, skips already-filled', async () => {
    const country = fakeEl({ label: 'Country' });
    const notice = fakeEl({ label: 'Notice period' });
    const why = fakeEl({ label: 'Why us?', required: true });
    const done = fakeEl({ label: 'Country', value: 'India' });
    const context = { $$: async () => [country, notice, why, done] };

    const res = await fillCustomQuestions(context, answers);

    expect(country.filled).toBe('India');
    expect(notice.filled).toBe('60 days');
    expect(why.filled).toBeNull();
    expect(done.filled).toBeNull();
    expect(res.filled).toEqual(['Country', 'Notice period']);
    expect(res.unanswered).toEqual(['Why us?']);
  });
});
