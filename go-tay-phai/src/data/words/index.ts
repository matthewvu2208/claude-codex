import type { Lang } from '../../lib/matching';
import type { WordSet } from '../../lib/storage';
import en1000 from './en-1000.json';
import en200 from './en-200.json';
import vi1000 from './vi-1000.json';
import vi200 from './vi-200.json';

const POOLS: Record<Lang, Record<WordSet, readonly string[]>> = {
  vi: { 200: vi200, 1000: vi1000 },
  en: { 200: en200, 1000: en1000 },
};

export function getPool(lang: Lang, wordSet: WordSet): readonly string[] {
  return POOLS[lang][wordSet];
}
