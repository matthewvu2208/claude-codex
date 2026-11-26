import { describe, expect, it } from 'vitest';
import { computeScore, type WordResult } from './scoring';

const ok = (w: string): WordResult => ({ target: w, typed: w, correct: true });
const bad = (target: string, typed: string): WordResult => ({ target, typed, correct: false });

describe('computeScore', () => {
  it('60 seconds, worked by hand', () => {
    // 20 correct 4-letter words → 20 × (4 + 1) = 100 correct chars.
    // wrong: "house"/"hous" → max(5,4)+1 = 6; "an"/"and" → max(2,3)+1 = 4 → 10 wrong chars.
    const results = [
      ...Array.from({ length: 20 }, () => ok('word')),
      bad('house', 'hous'),
      bad('an', 'and'),
    ];
    const s = computeScore(results, 60, 150);
    expect(s.correctChars).toBe(100);
    expect(s.wrongChars).toBe(10);
    expect(s.wpm).toBe(20); // (100 / 5) / 1
    expect(s.rawWpm).toBe(22); // (110 / 5) / 1
    expect(s.accuracy).toBeCloseTo(100 / 110);
    expect(s.correctWords).toBe(20);
    expect(s.wrongWords).toBe(2);
    expect(s.wordsPerMin).toBe(20);
    expect(s.keysPerMin).toBe(150);
  });

  it('30 seconds doubles the per-minute rates', () => {
    // Vietnamese: "việt" is 4 NFC characters even when typed as NFD.
    const results = [ok('việt'.normalize('NFD')), ok('nam'), bad('đi', 'di')];
    const s = computeScore(results, 30, 40);
    expect(s.correctChars).toBe(5 + 4); // việt+space, nam+space
    expect(s.wrongChars).toBe(3); // max(2,2)+1
    expect(s.wpm).toBe(Math.round((9 / 5) * 2)); // 3.6 → 4
    expect(s.rawWpm).toBe(Math.round((12 / 5) * 2)); // 4.8 → 5
    expect(s.wordsPerMin).toBe(4);
    expect(s.keysPerMin).toBe(80);
  });

  it('handles an empty test', () => {
    const s = computeScore([], 60);
    expect(s.wpm).toBe(0);
    expect(s.accuracy).toBe(0);
  });
});
