import { describe, expect, it } from 'vitest';
import {
  addResult,
  DEFAULT_SETTINGS,
  exportData,
  importData,
  KEYS,
  loadDaily,
  loadResults,
  loadSettings,
  MAX_RESULTS,
  memoryStore,
  saveSettings,
  type KVStore,
  type TestResult,
} from './storage';

function result(i: number, createdAt = '2026-11-20T10:00:00.000Z'): TestResult {
  return {
    id: `r${i}`,
    createdAt,
    lang: 'vi',
    wordSet: 200,
    mode: 'timed',
    durationSec: 60,
    wpm: 20 + (i % 5),
    rawWpm: 25,
    accuracy: 0.9,
    correctWords: 30,
    wrongWords: 2,
    correctChars: 100,
    wrongChars: 10,
    keysPerMin: 150,
    perKey: { KeyA: { count: 3, totalMs: 600, timedCount: 3, errors: 0 } },
    perFinger: {},
    wrongList: [{ target: 'việt', typed: 'viet' }],
    profileId: 'two-anchor',
    seed: i,
  };
}

describe('storage', () => {
  it('broken data does not crash and falls back to defaults', () => {
    const store = memoryStore();
    store.setItem(KEYS.settings, '{not json');
    store.setItem(KEYS.results, '{"oops": 1}');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(loadResults(store)).toEqual([]);
    store.setItem(KEYS.results, JSON.stringify([result(1), { id: 5 }, null]));
    expect(loadResults(store)).toHaveLength(1);
    store.setItem(KEYS.settings, JSON.stringify({ lang: 'fr', fontSize: 32 }));
    expect(loadSettings(store)).toEqual({ ...DEFAULT_SETTINGS, fontSize: 32 });
  });

  it('survives a store that throws', () => {
    const throwing: KVStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, throwing)).toBe(false);
    expect(() => addResult(result(1), throwing)).not.toThrow();
  });

  it('export then import keeps the data', () => {
    const a = memoryStore();
    saveSettings({ ...DEFAULT_SETTINGS, lang: 'en', fontSize: 36 }, a);
    addResult(result(1), a);
    addResult(result(2), a);
    const json = exportData(a);

    const b = memoryStore();
    expect(importData(json, b)).toEqual({ ok: true, results: 2 });
    expect(loadSettings(b)).toEqual(loadSettings(a));
    expect(loadResults(b)).toEqual(loadResults(a));
  });

  it('rejects an invalid import without touching data', () => {
    const s = memoryStore();
    addResult(result(1), s);
    expect(importData('nope', s).ok).toBe(false);
    expect(importData('{"format":"other","results":[]}', s).ok).toBe(false);
    expect(loadResults(s)).toHaveLength(1);
  });

  it('folds the oldest results into daily summaries beyond the limit', () => {
    const s = memoryStore();
    const many = Array.from({ length: MAX_RESULTS }, (_, i) => result(i));
    s.setItem(KEYS.results, JSON.stringify(many));
    addResult(result(MAX_RESULTS), s);
    addResult(result(MAX_RESULTS + 1), s);
    expect(loadResults(s)).toHaveLength(MAX_RESULTS);
    const daily = loadDaily(s);
    expect(daily).toHaveLength(1);
    expect(daily[0]?.tests).toBe(2);
  });
});
