import { describe, test, expect } from 'vitest';
import ResumeGenerator from '../src/core/resumeGenerator.js';

describe('_extractBalancedArray', () => {
  const rg = new ResumeGenerator();

  test('extracts a simple flat array', () => {
    const result = rg._extractBalancedArray('some text ["a", "b"] more');
    expect(result).toBe('["a", "b"]');
    expect(JSON.parse(result)).toEqual(['a', 'b']);
  });

  test('extracts an array containing nested arrays without stopping early', () => {
    const text = 'prefix [["a","b"], ["c","d"]] suffix';
    const result = rg._extractBalancedArray(text);
    expect(result).toBe('[["a","b"], ["c","d"]]');
    expect(JSON.parse(result)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  test('extracts array from prose-wrapped model output', () => {
    const text = 'Here are the top keywords for this role:\n["Python", "AWS", "Docker"]\nLet me know if you need more.';
    const result = rg._extractBalancedArray(text);
    expect(JSON.parse(result)).toEqual(['Python', 'AWS', 'Docker']);
  });

  test('returns null when there is no opening bracket', () => {
    expect(rg._extractBalancedArray('no array here')).toBeNull();
  });

  test('returns null when the closing bracket is missing (truncated response)', () => {
    expect(rg._extractBalancedArray('some text ["a", "b"')).toBeNull();
  });
});
