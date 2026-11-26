import { describe, expect, it } from 'vitest';
import { initialState, typingReducer, type TestConfig, type TypingState } from './typingReducer';

const pool = ['việt', 'nam', 'đi', 'học', 'không', 'người', 'có', 'là'];
const cfg = (over: Partial<TestConfig> = {}): TestConfig => ({
  lang: 'vi',
  wordSet: 200,
  mode: 'timed',
  durationSec: 60,
  wordCount: 25,
  seed: 1,
  ...over,
});

function type(state: TypingState, value: string, now: number, composing = false): TypingState {
  return typingReducer(state, { type: 'input', value, composing, now });
}

describe('typingReducer', () => {
  it('starts on the first real character, not on a space', () => {
    let s = initialState(cfg(), pool);
    s = type(s, ' ', 5);
    expect(s.status).toBe('idle');
    s = type(s, 'v', 10);
    expect(s.status).toBe('running');
    expect(s.startedAt).toBe(10);
  });

  it('submits on a trailing space and marks right and wrong words', () => {
    let s = initialState(cfg(), pool);
    const [w0, w1] = s.words as [string, string];
    s = type(s, w0, 0);
    s = type(s, `${w0} `, 100);
    expect(s.currentIndex).toBe(1);
    expect(s.results[0]).toEqual({ target: w0, typed: w0, correct: true });
    s = type(s, 'xyz ', 200);
    expect(s.results[1]).toEqual({ target: w1, typed: 'xyz', correct: false });
    expect(s.currentInput).toBe('');
  });

  it('accepts NFD input and old-style tone placement as correct', () => {
    let s = initialState(cfg(), ['hòa']);
    s = type(s, 'hoà ', 0);
    expect(s.results[0]?.correct).toBe(true);
    s = type(s, `${'hòa'.normalize('NFD')} `, 1);
    expect(s.results[1]?.correct).toBe(true);
  });

  it('waits while composing, then submits', () => {
    let s = initialState(cfg(), ['việt']);
    s = type(s, 'việt ', 0, true);
    expect(s.results).toHaveLength(0);
    s = type(s, 'việt ', 1, false);
    expect(s.results).toHaveLength(1);
  });

  it('ignores a space in an empty input', () => {
    let s = initialState(cfg(), pool);
    s = type(s, 'a', 0);
    s = type(s, '', 1);
    s = type(s, ' ', 2);
    expect(s.results).toHaveLength(0);
    expect(s.currentInput).toBe('');
  });

  it('finishes when time is up and then ignores input', () => {
    let s = initialState(cfg({ durationSec: 15 }), pool);
    s = type(s, 'a', 1000);
    s = typingReducer(s, { type: 'tick', now: 15_999 });
    expect(s.status).toBe('running');
    s = typingReducer(s, { type: 'tick', now: 16_000 });
    expect(s.status).toBe('finished');
    expect(s.endedAt).toBe(16_000);
    const after = type(s, 'abc ', 16_100);
    expect(after).toBe(s);
  });

  it('words mode finishes after N words', () => {
    let s = initialState(cfg({ mode: 'words', wordCount: 3 }), pool);
    expect(s.words).toHaveLength(3);
    s = type(s, 'a ', 0);
    s = type(s, 'b ', 500);
    expect(s.status).toBe('running');
    s = type(s, 'c ', 900);
    expect(s.status).toBe('finished');
    expect(s.endedAt).toBe(900);
  });

  it('extends the word list near the end', () => {
    let s = initialState(cfg(), pool);
    const start = s.words.length;
    for (let i = 0; i < start - 50; i++) s = type(s, 'x ', i);
    expect(s.words.length).toBeGreaterThan(start);
  });

  it('records tracked keys and counts backspaces', () => {
    let s = initialState(cfg(), pool);
    s = typingReducer(s, { type: 'keydown', code: 'KeyV', now: 1 });
    s = typingReducer(s, { type: 'keydown', code: 'Backspace', now: 2 });
    s = typingReducer(s, { type: 'keydown', code: 'ShiftLeft', now: 3 });
    s = typingReducer(s, { type: 'keydown', code: '', now: 4 });
    expect(s.keystrokes).toEqual([{ code: 'KeyV', t: 1 }]);
    expect(s.backspaces).toBe(1);
  });
});
