import { describe, expect, it } from 'vitest';
import { generateWeighted, generateWords, mulberry32, NO_REPEAT_WINDOW } from './generator';

const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

function noRepeat(words: string[]): boolean {
  for (let i = 0; i < words.length; i++) {
    const window = words.slice(Math.max(0, i - NO_REPEAT_WINDOW), i);
    if (window.includes(words[i] as string)) return false;
  }
  return true;
}

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('generateWords', () => {
  it('same seed → same words', () => {
    expect(generateWords(pool, 200, 7)).toEqual(generateWords(pool, 200, 7));
    expect(generateWords(pool, 200, 7)).not.toEqual(generateWords(pool, 200, 8));
  });
  it('never repeats a word within the last 5', () => {
    for (let seed = 0; seed < 20; seed++)
      expect(noRepeat(generateWords(pool, 300, seed))).toBe(true);
  });
  it('only uses words from the pool', () => {
    expect(generateWords(pool, 300, 1).every((w) => pool.includes(w))).toBe(true);
  });
  it('respects the history when extending', () => {
    const first = generateWords(pool, 50, 3);
    const more = generateWords(pool, 50, 99, first);
    expect(noRepeat([...first, ...more])).toBe(true);
  });
  it('still works with a pool smaller than the window', () => {
    expect(generateWords(['x', 'y'], 10, 1)).toHaveLength(10);
  });
});

describe('generateWeighted', () => {
  it('prefers heavy words and skips zero weights', () => {
    const words = generateWeighted(pool, (w) => (w === 'a' ? 10 : w === 'b' ? 0 : 1), 2000, 5);
    const count = (w: string): number => words.filter((x) => x === w).length;
    expect(count('b')).toBe(0);
    expect(count('a')).toBeGreaterThan(count('c'));
    expect(noRepeat(words)).toBe(true);
  });
});
