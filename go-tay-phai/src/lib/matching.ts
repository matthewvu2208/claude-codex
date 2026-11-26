/** Language-aware word comparison used by the typing engine. */

import { looseMatchVi, nfc, strictEqualVi } from './vietnamese';

export type Lang = 'vi' | 'en';

/** Final check when a word is submitted. */
export function isWordCorrect(lang: Lang, typed: string, target: string): boolean {
  if (lang === 'vi') return strictEqualVi(typed, target);
  return nfc(typed.trim()) === nfc(target);
}

/** Live check while typing: false means the current input should turn red. */
export function isOnTrack(lang: Lang, typed: string, target: string): boolean {
  if (lang === 'vi') return looseMatchVi(typed, target);
  return nfc(target).startsWith(nfc(typed));
}
