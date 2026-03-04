import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from '../fuzzyMatch';

describe('fuzzyMatch', () => {
  it('returns match with score 1 for empty query', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ match: true, score: 1 });
  });

  it('returns match with score 2 for exact substring', () => {
    expect(fuzzyMatch('meet', 'Meetings')).toEqual({ match: true, score: 2 });
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('DEEP', 'deep work')).toEqual({ match: true, score: 2 });
    expect(fuzzyMatch('deep', 'DEEP WORK')).toEqual({ match: true, score: 2 });
  });

  it('matches fuzzy characters in order', () => {
    const result = fuzzyMatch('dw', 'Deep Work');
    expect(result.match).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(2); // Not a substring match
  });

  it('returns no match when characters are not in order', () => {
    expect(fuzzyMatch('zxy', 'abc')).toEqual({ match: false, score: 0 });
  });

  it('returns no match when query is longer than target', () => {
    expect(fuzzyMatch('abcdef', 'abc')).toEqual({ match: false, score: 0 });
  });

  it('scores consecutive matches higher', () => {
    const consecutive = fuzzyMatch('mee', 'Meetings');
    const scattered = fuzzyMatch('mig', 'Meetings'); // m...i...g scattered
    expect(consecutive.score).toBeGreaterThan(scattered.score);
  });

  it('handles single character queries', () => {
    const result = fuzzyMatch('m', 'Meetings');
    expect(result.match).toBe(true);
    expect(result.score).toBe(2); // substring match
  });

  it('handles exact full match', () => {
    expect(fuzzyMatch('break', 'Break')).toEqual({ match: true, score: 2 });
  });
});
