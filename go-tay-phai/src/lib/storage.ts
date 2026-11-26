/**
 * Versioned localStorage with safe fallbacks, plus JSON export/import.
 * Every read and write is wrapped in try/catch: broken data never crashes the app.
 */

import type { Lang } from './matching';
import type { ToneStyle } from './vietnamese';

export const KEYS = {
  settings: 'gtp:v1:settings',
  results: 'gtp:v1:results',
  daily: 'gtp:v1:daily',
} as const;

export const MAX_RESULTS = 2000;
export const EXPORT_FORMAT = 'go-tay-phai';
export const EXPORT_VERSION = 1;

export type WordSet = 200 | 1000;
/** 0 = no time limit (type a fixed number of words). */
export type Duration = 0 | 15 | 30 | 60 | 120;
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  lang: Lang;
  wordSet: WordSet;
  durationSec: Duration;
  wordCount: number;
  fontSize: number;
  theme: Theme;
  keyHint: ToneStyle | 'off';
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'vi',
  wordSet: 200,
  durationSec: 60,
  wordCount: 25,
  fontSize: 28,
  theme: 'system',
  keyHint: 'telex',
};

export interface KeyStat {
  count: number;
  /** Sum of gaps (ms) before this key, only gaps <= 2000ms. */
  totalMs: number;
  timedCount: number;
  errors: number;
}

export interface TestResult {
  id: string;
  createdAt: string;
  lang: Lang;
  wordSet: WordSet;
  mode: 'timed' | 'words';
  durationSec: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctWords: number;
  wrongWords: number;
  correctChars: number;
  wrongChars: number;
  keysPerMin: number;
  perKey: Record<string, KeyStat>;
  perFinger: Record<string, KeyStat>;
  wrongList: { target: string; typed: string }[];
  profileId: string;
  seed: number;
}

/** Older results folded into one row per day and language. */
export interface DailySummary {
  date: string;
  lang: Lang;
  tests: number;
  seconds: number;
  avgWpm: number;
  avgAccuracy: number;
}

export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory store used when localStorage is missing or throws. */
export function memoryStore(): KVStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

let fallback: KVStore | null = null;
export function defaultStore(): KVStore {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__gtp_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    // fall through
  }
  fallback ??= memoryStore();
  return fallback;
}

function readJson(store: KVStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function writeJson(store: KVStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function oneOf<T>(value: unknown, allowed: readonly T[], fallbackValue: T): T {
  return allowed.includes(value as T) ? (value as T) : fallbackValue;
}

/** Keeps every valid field, replaces anything broken with its default. */
export function sanitizeSettings(v: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(v)) return { ...d };
  const wordCount = isNum(v['wordCount']) ? Math.round(v['wordCount']) : d.wordCount;
  const fontSize = isNum(v['fontSize']) ? Math.round(v['fontSize']) : d.fontSize;
  return {
    lang: oneOf(v['lang'], ['vi', 'en'] as const, d.lang),
    wordSet: oneOf(v['wordSet'], [200, 1000] as const, d.wordSet),
    durationSec: oneOf(v['durationSec'], [0, 15, 30, 60, 120] as const, d.durationSec),
    wordCount: Math.min(500, Math.max(5, wordCount)),
    fontSize: Math.min(56, Math.max(16, fontSize)),
    theme: oneOf(v['theme'], ['system', 'light', 'dark'] as const, d.theme),
    keyHint: oneOf(v['keyHint'], ['telex', 'vni', 'off'] as const, d.keyHint),
  };
}

function isKeyStatMap(v: unknown): v is Record<string, KeyStat> {
  return isObj(v) && Object.values(v).every((s) => isObj(s) && isNum(s['count']));
}

export function isTestResult(v: unknown): v is TestResult {
  return (
    isObj(v) &&
    isStr(v['id']) &&
    isStr(v['createdAt']) &&
    (v['lang'] === 'vi' || v['lang'] === 'en') &&
    (v['wordSet'] === 200 || v['wordSet'] === 1000) &&
    (v['mode'] === 'timed' || v['mode'] === 'words') &&
    isNum(v['durationSec']) &&
    isNum(v['wpm']) &&
    isNum(v['rawWpm']) &&
    isNum(v['accuracy']) &&
    isNum(v['correctWords']) &&
    isNum(v['wrongWords']) &&
    isNum(v['correctChars']) &&
    isNum(v['wrongChars']) &&
    isNum(v['keysPerMin']) &&
    isKeyStatMap(v['perKey']) &&
    isKeyStatMap(v['perFinger']) &&
    Array.isArray(v['wrongList']) &&
    isStr(v['profileId']) &&
    isNum(v['seed'])
  );
}

function isDailySummary(v: unknown): v is DailySummary {
  return (
    isObj(v) &&
    isStr(v['date']) &&
    (v['lang'] === 'vi' || v['lang'] === 'en') &&
    isNum(v['tests']) &&
    isNum(v['seconds']) &&
    isNum(v['avgWpm']) &&
    isNum(v['avgAccuracy'])
  );
}

export function loadSettings(store: KVStore = defaultStore()): Settings {
  return sanitizeSettings(readJson(store, KEYS.settings));
}

export function saveSettings(settings: Settings, store: KVStore = defaultStore()): boolean {
  return writeJson(store, KEYS.settings, settings);
}

/** Valid results only, oldest first. Broken entries are dropped. */
export function loadResults(store: KVStore = defaultStore()): TestResult[] {
  const raw = readJson(store, KEYS.results);
  return Array.isArray(raw) ? raw.filter(isTestResult) : [];
}

export function loadDaily(store: KVStore = defaultStore()): DailySummary[] {
  const raw = readJson(store, KEYS.daily);
  return Array.isArray(raw) ? raw.filter(isDailySummary) : [];
}

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Folds results into the per-day summaries (merging with existing rows). */
export function foldIntoDaily(
  daily: readonly DailySummary[],
  old: readonly TestResult[],
): DailySummary[] {
  const map = new Map(daily.map((d) => [`${d.date}|${d.lang}`, { ...d }]));
  for (const r of old) {
    const key = `${localDate(r.createdAt)}|${r.lang}`;
    const cur = map.get(key) ?? {
      date: localDate(r.createdAt),
      lang: r.lang,
      tests: 0,
      seconds: 0,
      avgWpm: 0,
      avgAccuracy: 0,
    };
    const n = cur.tests + 1;
    cur.avgWpm = (cur.avgWpm * cur.tests + r.wpm) / n;
    cur.avgAccuracy = (cur.avgAccuracy * cur.tests + r.accuracy) / n;
    cur.tests = n;
    cur.seconds += r.durationSec;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Appends a result; beyond MAX_RESULTS the oldest are folded into daily summaries. */
export function addResult(result: TestResult, store: KVStore = defaultStore()): TestResult[] {
  let results = [...loadResults(store), result];
  if (results.length > MAX_RESULTS) {
    const overflow = results.slice(0, results.length - MAX_RESULTS);
    results = results.slice(-MAX_RESULTS);
    writeJson(store, KEYS.daily, foldIntoDaily(loadDaily(store), overflow));
  }
  writeJson(store, KEYS.results, results);
  return results;
}

export function clearAll(store: KVStore = defaultStore()): void {
  for (const k of Object.values(KEYS)) {
    try {
      store.removeItem(k);
    } catch {
      // ignore
    }
  }
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  settings: Settings;
  results: TestResult[];
  daily: DailySummary[];
}

export function exportData(store: KVStore = defaultStore(), now = new Date()): string {
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    settings: loadSettings(store),
    results: loadResults(store),
    daily: loadDaily(store),
  };
  return JSON.stringify(file, null, 2);
}

export type ImportOutcome = { ok: true; results: number } | { ok: false; error: 'invalid' };

/** Replaces stored data with the file's content. Leaves data untouched if the file is invalid. */
export function importData(json: string, store: KVStore = defaultStore()): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (!isObj(parsed) || parsed['format'] !== EXPORT_FORMAT || !Array.isArray(parsed['results'])) {
    return { ok: false, error: 'invalid' };
  }
  const results = parsed['results'].filter(isTestResult).slice(-MAX_RESULTS);
  const daily = Array.isArray(parsed['daily']) ? parsed['daily'].filter(isDailySummary) : [];
  writeJson(store, KEYS.settings, sanitizeSettings(parsed['settings']));
  writeJson(store, KEYS.results, results);
  writeJson(store, KEYS.daily, daily);
  return { ok: true, results: results.length };
}
