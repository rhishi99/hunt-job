import { describe, test, expect } from 'vitest';
import { normalizeConceptsToMaster, toStr } from '../src/core/interviewPrep.js';

// Regression tests for the "flatMap is not a function" crash: conceptsToMaster
// comes back from the LLM in three different shapes depending on the model/prompt
// drift, and every consumer must handle all three without throwing.
describe('normalizeConceptsToMaster', () => {
  test('handles a flat string array', () => {
    const result = normalizeConceptsToMaster(['DSA', 'System Design']);
    expect(result).toEqual({ General: ['DSA', 'System Design'] });
  });

  test('handles an array of {category, topics} objects', () => {
    const result = normalizeConceptsToMaster([
      { category: 'Backend', topics: ['REST', 'Caching'] },
      { category: 'DSA', concepts: ['Trees', 'Graphs'] },
    ]);
    expect(result.Backend).toEqual(['REST', 'Caching']);
    expect(result.DSA).toEqual(['Trees', 'Graphs']);
  });

  test('handles a plain {category: [items]} object (not an array) without crashing', () => {
    const result = normalizeConceptsToMaster({
      Backend: ['REST', 'Caching'],
      DSA: ['Trees'],
    });
    expect(result.Backend).toEqual(['REST', 'Caching']);
    expect(result.DSA).toEqual(['Trees']);
  });

  test('handles a bare string value under a category', () => {
    const result = normalizeConceptsToMaster({ Backend: 'REST APIs' });
    expect(result.Backend).toEqual(['REST APIs']);
  });

  test('handles undefined/null/empty without throwing', () => {
    expect(normalizeConceptsToMaster(undefined)).toEqual({});
    expect(normalizeConceptsToMaster(null)).toEqual({});
    expect(normalizeConceptsToMaster([])).toEqual({});
  });

  test('handles an object concept item with no topics/concepts array', () => {
    const result = normalizeConceptsToMaster([{ category: 'Cloud', name: 'AWS basics' }]);
    expect(result.Cloud).toEqual(['AWS basics']);
  });
});

describe('toStr', () => {
  test('passes strings through', () => {
    expect(toStr('hello')).toBe('hello');
  });

  test('extracts a readable field from an object instead of [object Object]', () => {
    expect(toStr({ name: 'REST APIs' })).toBe('REST APIs');
    expect(toStr({ title: 'System Design Basics' })).toBe('System Design Basics');
  });

  test('falls back to JSON.stringify for objects with no known field', () => {
    expect(toStr({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });

  test('stringifies numbers', () => {
    expect(toStr(42)).toBe('42');
  });
});
