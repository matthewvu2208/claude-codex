/** Heuristics for the IME warning banner (plan §7.3). Pure, no React. */

import type { Lang } from './matching';
import type { WordResult } from './scoring';
import { hasDiacritics, looseMatchVi, stripAll } from './vietnamese';

export type ImeIssue = 'vi-ime-on' | 'vi-ime-off' | null;

/** Words with diacritics that must be checked before warning that the IME is off. */
export const ACCENT_CHECK_WORDS = 5;

const NON_ASCII = /[^ -~]/;
const RAW_TELEX_PAIRS = ['aa', 'dd', 'ee', 'oo'];

/** True when the typed text looks like raw Telex/VNI keys for the target. */
function looksLikeRawKeys(typed: string, target: string): boolean {
  if (typed === '' || NON_ASCII.test(typed)) return false;
  if (looseMatchVi(typed, target)) return false;
  const plainTarget = stripAll(target);
  if (RAW_TELEX_PAIRS.some((p) => typed.includes(p) && !plainTarget.includes(p))) return true;
  const last = typed[typed.length - 1] ?? '';
  if (/[sfrxjw]/.test(last) && !plainTarget.includes(last)) return true;
  // VNI number keys.
  return /[0-9]/.test(typed);
}

/**
 * @param results submitted words so far
 * @param currentInput what is in the input box now
 * @param currentTarget the word being typed now
 */
export function detectImeIssue(
  lang: Lang,
  results: readonly WordResult[],
  currentInput: string,
  currentTarget: string,
): ImeIssue {
  if (lang === 'en') {
    if (NON_ASCII.test(currentInput.trim())) return 'vi-ime-on';
    const last = results[results.length - 1];
    if (last && NON_ASCII.test(last.typed)) return 'vi-ime-on';
    return null;
  }
  if (looksLikeRawKeys(currentInput.trim(), currentTarget)) return 'vi-ime-off';
  const last = results[results.length - 1];
  if (last && !last.correct && looksLikeRawKeys(last.typed, last.target)) return 'vi-ime-off';
  // After the first 5 words: every accented target among the recent words
  // was submitted without any accent.
  if (results.length >= ACCENT_CHECK_WORDS) {
    const recent = results.slice(-10).filter((r) => hasDiacritics(r.target));
    if (recent.length >= 2 && recent.every((r) => !hasDiacritics(r.typed))) return 'vi-ime-off';
  }
  return null;
}
