import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { aggregateKeys } from '../lib/keyStats';
import { isOnTrack } from '../lib/matching';
import { computeScore, type Score } from '../lib/scoring';
import { addResult, type TestResult } from '../lib/storage';
import {
  elapsedSeconds,
  initialState,
  typingReducer,
  type TestConfig,
  type TypingState,
} from './typingReducer';

const TICK_MS = 100;
const PROFILE_ID = 'two-anchor';

export interface TypingTest {
  state: TypingState;
  /** Seconds since the first keystroke (frozen when finished). */
  elapsed: number;
  /** False when the current input no longer matches the start of the current word. */
  onTrack: boolean;
  score: Score | null;
  saved: boolean | null;
  input: (value: string, composing: boolean) => void;
  keydown: (code: string) => void;
}

function buildResult(state: TypingState, score: Score, seconds: number): TestResult {
  const { config } = state;
  return {
    id: `${Date.now().toString(36)}-${config.seed.toString(36)}`,
    createdAt: new Date().toISOString(),
    lang: config.lang,
    wordSet: config.wordSet,
    mode: config.mode,
    durationSec: Math.round(seconds),
    wpm: score.wpm,
    rawWpm: score.rawWpm,
    accuracy: score.accuracy,
    correctWords: score.correctWords,
    wrongWords: score.wrongWords,
    correctChars: score.correctChars,
    wrongChars: score.wrongChars,
    keysPerMin: score.keysPerMin,
    perKey: aggregateKeys(state.keystrokes),
    perFinger: {},
    wrongList: state.results
      .filter((r) => !r.correct)
      .map(({ target, typed }) => ({ target, typed })),
    profileId: PROFILE_ID,
    seed: config.seed,
  };
}

function testSeconds(state: TypingState): number {
  return state.config.mode === 'timed' ? state.config.durationSec : elapsedSeconds(state, 0);
}

export function useTypingTest(config: TestConfig, pool: readonly string[]): TypingTest {
  const [state, dispatch] = useReducer(typingReducer, undefined, () => initialState(config, pool));
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<boolean | null>(null);
  const savedFor = useRef<number | null>(null);

  // Clock: performance.now() polled every 100ms, never accumulated.
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      dispatch({ type: 'tick', now: t });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status]);

  const score = useMemo(() => {
    if (state.status !== 'finished') return null;
    return computeScore(state.results, testSeconds(state), state.keystrokes.length);
  }, [state]);

  // Save once per finished test.
  useEffect(() => {
    if (!score || state.startedAt === null || savedFor.current === state.startedAt) return;
    savedFor.current = state.startedAt;
    const results = addResult(buildResult(state, score, testSeconds(state)));
    setSaved(results.length > 0);
  }, [score, state]);

  const input = useCallback((value: string, composing: boolean) => {
    dispatch({ type: 'input', value, composing, now: performance.now() });
  }, []);
  const keydown = useCallback((code: string) => {
    dispatch({ type: 'keydown', code, now: performance.now() });
  }, []);

  const target = state.words[state.currentIndex] ?? '';
  return {
    state,
    elapsed: elapsedSeconds(state, Math.max(now, state.startedAt ?? 0)),
    onTrack: isOnTrack(state.config.lang, state.currentInput.trim(), target),
    score,
    saved,
    input,
    keydown,
  };
}
