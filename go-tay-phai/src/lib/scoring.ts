/** Score formulas (10FastFingers style). Pure, no React. */

import { charLength } from './vietnamese';

export interface WordResult {
  target: string;
  typed: string;
  correct: boolean;
}

export interface Score {
  wpm: number;
  rawWpm: number;
  /** 0..1 */
  accuracy: number;
  correctWords: number;
  wrongWords: number;
  correctChars: number;
  wrongChars: number;
  wordsPerMin: number;
  keysPerMin: number;
}

/** Rounds to one decimal place. */
const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * @param results submitted words (the unfinished current word is not counted)
 * @param seconds test duration in seconds
 * @param keystrokes physical key presses counted during the test
 */
export function computeScore(
  results: readonly WordResult[],
  seconds: number,
  keystrokes = 0,
): Score {
  let correctChars = 0;
  let wrongChars = 0;
  let correctWords = 0;
  for (const w of results) {
    if (w.correct) {
      correctWords++;
      correctChars += charLength(w.target) + 1;
    } else {
      wrongChars += Math.max(charLength(w.target), charLength(w.typed)) + 1;
    }
  }
  const minutes = seconds / 60;
  const per = (n: number): number => (minutes > 0 ? n / minutes : 0);
  const total = correctChars + wrongChars;
  return {
    wpm: Math.round(per(correctChars / 5)),
    rawWpm: Math.round(per(total / 5)),
    accuracy: total > 0 ? correctChars / total : 0,
    correctWords,
    wrongWords: results.length - correctWords,
    correctChars,
    wrongChars,
    wordsPerMin: r1(per(correctWords)),
    keysPerMin: Math.round(per(keystrokes)),
  };
}
