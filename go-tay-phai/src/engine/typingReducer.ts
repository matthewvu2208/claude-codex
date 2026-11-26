/**
 * State machine of one typing test: idle → running → finished.
 * Pure reducer: time comes in through actions (`now`, from performance.now()).
 */

import { generateWords } from '../lib/generator';
import { isWordCorrect, type Lang } from '../lib/matching';
import type { WordResult } from '../lib/scoring';

export type Status = 'idle' | 'running' | 'finished';

export interface TestConfig {
  lang: Lang;
  wordSet: 200 | 1000;
  /** 'timed': ends after durationSec; 'words': ends after wordCount words. */
  mode: 'timed' | 'words';
  durationSec: number;
  wordCount: number;
  seed: number;
}

export interface Keystroke {
  code: string;
  /** performance.now() timestamp */
  t: number;
  /** For English: the key the user should have pressed, when this press was a mistake. */
  expected?: string;
}

export interface TypingState {
  config: TestConfig;
  pool: readonly string[];
  status: Status;
  words: string[];
  currentIndex: number;
  currentInput: string;
  results: WordResult[];
  startedAt: number | null;
  endedAt: number | null;
  keystrokes: Keystroke[];
  backspaces: number;
}

export type TypingAction =
  | { type: 'reset'; config: TestConfig; pool: readonly string[] }
  | { type: 'input'; value: string; composing: boolean; now: number }
  | { type: 'keydown'; code: string; now: number }
  | { type: 'tick'; now: number };

/** Words generated up front; more are added when the user gets close to the end. */
export const INITIAL_WORDS = 300;
export const EXTEND_MARGIN = 60;
export const EXTEND_BY = 200;

/** Physical keys that count as typing work (letters, digits, punctuation, Space). */
const TRACKED_CODE =
  /^(Key[A-Z]|Digit[0-9]|Space|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/;

export function isTrackedCode(code: string): boolean {
  return TRACKED_CODE.test(code);
}

export function initialState(config: TestConfig, pool: readonly string[]): TypingState {
  const count = config.mode === 'words' ? config.wordCount : INITIAL_WORDS;
  return {
    config,
    pool,
    status: 'idle',
    words: generateWords(pool, count, config.seed),
    currentIndex: 0,
    currentInput: '',
    results: [],
    startedAt: null,
    endedAt: null,
    keystrokes: [],
    backspaces: 0,
  };
}

function extendIfNeeded(state: TypingState): string[] {
  if (state.config.mode === 'words') return state.words;
  if (state.words.length - state.currentIndex > EXTEND_MARGIN) return state.words;
  const more = generateWords(
    state.pool,
    EXTEND_BY,
    (state.config.seed + state.words.length) >>> 0,
    state.words,
  );
  return [...state.words, ...more];
}

function submit(state: TypingState, typed: string, now: number): TypingState {
  const target = state.words[state.currentIndex];
  if (target === undefined) return state;
  const result: WordResult = {
    target,
    typed,
    correct: isWordCorrect(state.config.lang, typed, target),
  };
  const results = [...state.results, result];
  const next: TypingState = {
    ...state,
    results,
    currentIndex: state.currentIndex + 1,
    currentInput: '',
  };
  if (state.config.mode === 'words' && results.length >= state.config.wordCount) {
    return { ...next, status: 'finished', endedAt: now };
  }
  return { ...next, words: extendIfNeeded(next) };
}

function timeUp(state: TypingState, now: number): boolean {
  return (
    state.config.mode === 'timed' &&
    state.startedAt !== null &&
    now - state.startedAt >= state.config.durationSec * 1000
  );
}

function finishByTime(state: TypingState): TypingState {
  const endedAt = (state.startedAt ?? 0) + state.config.durationSec * 1000;
  return { ...state, status: 'finished', endedAt };
}

export function typingReducer(state: TypingState, action: TypingAction): TypingState {
  switch (action.type) {
    case 'reset':
      return initialState(action.config, action.pool);

    case 'tick':
      return state.status === 'running' && timeUp(state, action.now) ? finishByTime(state) : state;

    case 'keydown': {
      if (state.status === 'finished') return state;
      if (action.code === 'Backspace') return { ...state, backspaces: state.backspaces + 1 };
      if (!isTrackedCode(action.code)) return state;
      return { ...state, keystrokes: [...state.keystrokes, { code: action.code, t: action.now }] };
    }

    case 'input': {
      if (state.status === 'finished') return state;
      if (timeUp(state, action.now)) return finishByTime(state);
      let s = state;
      const value = action.value;
      if (s.status === 'idle') {
        if (value.trim() === '') return { ...s, currentInput: '' };
        s = { ...s, status: 'running', startedAt: action.now };
      }
      if (!action.composing && /\s$/.test(value)) {
        const typed = value.replace(/\s+/g, '');
        if (typed === '') return { ...s, currentInput: '' };
        return submit(s, typed, action.now);
      }
      return { ...s, currentInput: value };
    }
  }
}

/** Elapsed test time in seconds (frozen once finished). */
export function elapsedSeconds(state: TypingState, now: number): number {
  if (state.startedAt === null) return 0;
  const end = state.endedAt ?? now;
  return Math.max(0, (end - state.startedAt) / 1000);
}
