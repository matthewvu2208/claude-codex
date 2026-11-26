/**
 * Vietnamese text helpers: normalisation, tone splitting, loose/strict matching,
 * syllable validation, tone placement and Telex/VNI key sequences.
 * Pure functions only; no React, no DOM. Imports carry no extension-specific
 * code so the Node word-list script can import this file directly.
 */

export type Tone = 'none' | 'sac' | 'huyen' | 'hoi' | 'nga' | 'nang';

/** Combining marks for the five tones (NFD). */
const TONE_MARKS: Record<string, Exclude<Tone, 'none'>> = {
  '́': 'sac',
  '̀': 'huyen',
  '̉': 'hoi',
  '̃': 'nga',
  '̣': 'nang',
};

const TONE_TO_MARK: Record<Exclude<Tone, 'none'>, string> = {
  sac: '́',
  huyen: '̀',
  hoi: '̉',
  nga: '̃',
  nang: '̣',
};

/** NFC + lower case. Removes the difference between precomposed and combining Unicode. */
export function nfc(s: string): string {
  return s.normalize('NFC').toLowerCase();
}

/** Number of user-visible characters, counted on the NFC form. */
export function charLength(s: string): number {
  return Array.from(s.normalize('NFC')).length;
}

export interface SplitTone {
  /** The word without its tone mark, NFC, lower case. Keeps â ă ê ô ơ ư đ. */
  skeleton: string;
  tone: Tone;
}

/** Splits a syllable into its skeleton (vowel shapes kept) and its tone. */
export function splitTone(syllable: string): SplitTone {
  let tone: Tone = 'none';
  let out = '';
  for (const ch of syllable.normalize('NFD').toLowerCase()) {
    const t = TONE_MARKS[ch];
    if (t) {
      if (tone === 'none') tone = t;
    } else {
      out += ch;
    }
  }
  return { skeleton: out.normalize('NFC'), tone };
}

/** Number of tone marks in a string (a valid syllable has at most one). */
export function toneCount(s: string): number {
  let n = 0;
  for (const ch of s.normalize('NFD')) if (TONE_MARKS[ch]) n++;
  return n;
}

/**
 * Strict comparison used when a word is submitted. Accepts old and new tone
 * placement (hoà = hòa, thuỷ = thủy) because only skeleton + tone are compared.
 */
export function strictEqualVi(a: string, b: string): boolean {
  const sa = splitTone(a.trim());
  const sb = splitTone(b.trim());
  return sa.skeleton === sb.skeleton && sa.tone === sb.tone;
}

/** Removes every diacritic and maps đ → d. */
export function stripAll(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** True when the string contains any Vietnamese diacritic or đ. */
export function hasDiacritics(s: string): boolean {
  return stripAll(s) !== s.normalize('NFC').toLowerCase();
}

/**
 * Loose comparison while a word is still being typed. Intermediate Telex
 * states (v, vi, vie, viê, việ) all pass for the target "việt".
 */
export function looseMatchVi(typed: string, target: string): boolean {
  return stripAll(target).startsWith(stripAll(typed));
}

// ---------------------------------------------------------------------------
// Syllable validation
// ---------------------------------------------------------------------------

const ONSETS = [
  'ngh',
  'ng',
  'nh',
  'ch',
  'gh',
  'gi',
  'kh',
  'ph',
  'qu',
  'th',
  'tr',
  'b',
  'c',
  'd',
  'đ',
  'g',
  'h',
  'k',
  'l',
  'm',
  'n',
  'p',
  'r',
  's',
  't',
  'v',
  'x',
  '',
];

/** Nucleus → allowed codas (including glide codas). '' means an open syllable. */
const RHYME_TABLE: Record<string, string[]> = {
  a: ['', 'c', 'ch', 'i', 'm', 'n', 'ng', 'nh', 'o', 'p', 't', 'u', 'y'],
  ă: ['c', 'm', 'n', 'ng', 'p', 't'],
  â: ['c', 'm', 'n', 'ng', 'p', 't', 'u', 'y'],
  e: ['', 'c', 'm', 'n', 'ng', 'o', 'p', 't'],
  ê: ['', 'ch', 'm', 'n', 'nh', 'p', 't', 'u'],
  i: ['', 'a', 'ch', 'm', 'n', 'nh', 'p', 't', 'u'],
  iê: ['c', 'm', 'n', 'ng', 'p', 't', 'u'],
  yê: ['m', 'n', 'ng', 't', 'u'],
  o: ['', 'c', 'i', 'm', 'n', 'ng', 'p', 't'],
  oo: ['c', 'ng'],
  ô: ['', 'c', 'i', 'm', 'n', 'ng', 'p', 't'],
  ơ: ['', 'i', 'm', 'n', 'p', 't'],
  u: ['', 'a', 'c', 'i', 'm', 'n', 'ng', 'p', 't', 'y'],
  uô: ['c', 'i', 'm', 'n', 'ng', 't'],
  ư: ['', 'a', 'c', 'i', 'm', 'n', 'ng', 't', 'u'],
  ươ: ['c', 'i', 'm', 'n', 'ng', 'p', 't', 'u'],
  y: [''],
  // with medial o / u
  oa: ['', 'c', 'ch', 'i', 'm', 'n', 'ng', 'nh', 'o', 'p', 't', 'y'],
  oă: ['c', 'm', 'n', 'ng', 't'],
  oe: ['', 'n', 'o', 't'],
  uâ: ['n', 'ng', 't', 'y'],
  uê: ['', 'ch', 'n', 'nh'],
  uy: ['', 'a', 'ch', 'n', 'nh', 'p', 't', 'u'],
  uyê: ['n', 't'],
  uơ: [''],
};

const RHYMES: Set<string> = (() => {
  const set = new Set<string>();
  for (const [nucleus, codas] of Object.entries(RHYME_TABLE)) {
    for (const coda of codas) set.add(nucleus + coda);
  }
  return set;
})();

/**
 * Rhymes allowed after "qu": the u of "qu" is the medial, so the rhyme is the
 * rest (qua, quân, quê, quen, quy, quyết, quốc, quở).
 */
const QU_RHYMES: Set<string> = (() => {
  const set = new Set<string>();
  for (const r of RHYMES) {
    if (r.startsWith('u') && !r.startsWith('uô') && !r.startsWith('uơ')) {
      const rest = r.slice(1);
      if (rest) set.add(rest);
    } else if (!/^[uưoi]/.test(r)) {
      set.add(r);
    }
  }
  return set;
})();

const FRONT = /^[eêiy]/;

function onsetFits(onset: string, rhyme: string): boolean {
  if (rhyme === '') return false;
  const front = FRONT.test(rhyme) || rhyme.startsWith('iê');
  switch (onset) {
    case 'c':
      return !front;
    case 'k':
      return front;
    case 'g':
      return !/^[eê]/.test(rhyme);
    case 'gh':
      return front;
    case 'ng':
      return !front;
    case 'ngh':
      return front;
    case 'qu':
      return QU_RHYMES.has(rhyme);
    case 'gi':
      // "gi" + "i..." would be written with a single i (gì, gìn).
      return !rhyme.startsWith('i');
    case '':
      // Open initial "iê" is spelled "yê" (yên, yêu).
      return !rhyme.startsWith('iê');
    default:
      return !rhyme.startsWith('yê');
  }
}

/** Stop codas (p t c ch) only take the sắc or nặng tone. */
function toneFitsCoda(rhyme: string, tone: Tone): boolean {
  if (/(p|t|c|ch)$/.test(rhyme)) return tone === 'sac' || tone === 'nang';
  return true;
}

export interface SyllableParts {
  onset: string;
  rhyme: string;
}

/** Splits a toneless skeleton into onset + rhyme, or null when it is not a syllable. */
export function parseSkeleton(skeleton: string, tone: Tone = 'none'): SyllableParts | null {
  for (const onset of ONSETS) {
    if (!skeleton.startsWith(onset)) continue;
    const rhyme = skeleton.slice(onset.length);
    const known = onset === 'qu' ? QU_RHYMES.has(rhyme) : RHYMES.has(rhyme);
    if (known && onsetFits(onset, rhyme) && toneFitsCoda(rhyme, tone)) return { onset, rhyme };
  }
  return null;
}

/** True for a valid Vietnamese syllable: valid onset + valid rhyme + at most one tone. */
export function isVietnameseSyllable(word: string): boolean {
  const w = nfc(word);
  if (!/^[a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+$/.test(w)) {
    return false;
  }
  if (toneCount(w) > 1) return false;
  const { skeleton, tone } = splitTone(w);
  return parseSkeleton(skeleton, tone) !== null;
}

// ---------------------------------------------------------------------------
// Tone placement (one consistent display style)
// ---------------------------------------------------------------------------

const VOWELS = 'aăâeêioôơuưy';
const MODIFIED = 'ăâêôơư';

/**
 * Puts the tone mark back on the skeleton using the style "hòa, thủy, khỏe":
 * a vowel with a hat/hook/breve wins (the last one, so ươ → ơ); three vowels →
 * the middle one; two vowels → the first one in an open syllable, the second
 * one before a final consonant.
 */
export function placeTone(skeleton: string, tone: Tone): string {
  if (tone === 'none') return skeleton.normalize('NFC');
  const chars = Array.from(skeleton.normalize('NFC'));
  // Skip the onset's "u" of "qu" and "i" of "gi" (when a vowel follows).
  let start = 0;
  if (chars[0] === 'q' && chars[1] === 'u') start = 2;
  else if (chars[0] === 'g' && chars[1] === 'i' && chars[2] && VOWELS.includes(chars[2])) start = 2;

  const vowelIdx: number[] = [];
  for (let i = start; i < chars.length; i++) {
    const c = chars[i];
    if (c && VOWELS.includes(c)) vowelIdx.push(i);
    else if (vowelIdx.length > 0) break;
  }
  if (vowelIdx.length === 0) {
    // "gi" + consonant (gìn) or a bare "gi" (gì): tone on the i.
    const i = chars.indexOf('i');
    if (i < 0) return skeleton;
    vowelIdx.push(i);
  }
  const last = vowelIdx[vowelIdx.length - 1] ?? 0;
  const hasCoda = last < chars.length - 1;

  let target: number;
  const modified = vowelIdx.filter((i) => MODIFIED.includes(chars[i] ?? ''));
  if (modified.length > 0) target = modified[modified.length - 1] ?? last;
  else if (vowelIdx.length >= 3) target = vowelIdx[1] ?? last;
  else if (vowelIdx.length === 2) target = hasCoda ? last : (vowelIdx[0] ?? last);
  else target = vowelIdx[0] ?? last;

  chars[target] = (chars[target] + TONE_TO_MARK[tone]).normalize('NFC');
  return chars.join('').normalize('NFC');
}

/** Rewrites a syllable so its tone sits in the consistent display position. */
export function normalizeToneStyle(word: string): string {
  const { skeleton, tone } = splitTone(word);
  return placeTone(skeleton, tone);
}

// ---------------------------------------------------------------------------
// Telex / VNI key sequences (tone key at the end of the word)
// ---------------------------------------------------------------------------

export type ToneStyle = 'telex' | 'vni';

const TELEX_LETTERS: Record<string, string[]> = {
  â: ['a', 'a'],
  ă: ['a', 'w'],
  ê: ['e', 'e'],
  ô: ['o', 'o'],
  ơ: ['o', 'w'],
  ư: ['u', 'w'],
  đ: ['d', 'd'],
};
const TELEX_TONES: Record<Exclude<Tone, 'none'>, string> = {
  sac: 's',
  huyen: 'f',
  hoi: 'r',
  nga: 'x',
  nang: 'j',
};
const VNI_LETTERS: Record<string, string[]> = {
  â: ['a', '6'],
  ă: ['a', '8'],
  ê: ['e', '6'],
  ô: ['o', '6'],
  ơ: ['o', '7'],
  ư: ['u', '7'],
  đ: ['d', '9'],
};
const VNI_TONES: Record<Exclude<Tone, 'none'>, string> = {
  sac: '1',
  huyen: '2',
  hoi: '3',
  nga: '4',
  nang: '5',
};

export interface KeyPlan {
  /** Keys for letters and vowel shapes, without the tone key. */
  baseKeys: string[];
  /** The tone key, or null when the word has no tone. */
  toneKey: string | null;
}

/** Keys of the skeleton only; characters outside the maps pass through. */
export function baseKeysOf(text: string, style: ToneStyle): string[] {
  const letters = style === 'telex' ? TELEX_LETTERS : VNI_LETTERS;
  const { skeleton } = splitTone(text);
  const keys: string[] = [];
  for (const ch of skeleton) {
    const mapped = letters[ch];
    if (mapped) keys.push(...mapped);
    else keys.push(ch);
  }
  return keys;
}

export function keyPlan(word: string, style: ToneStyle): KeyPlan {
  const { tone } = splitTone(word);
  const tones = style === 'telex' ? TELEX_TONES : VNI_TONES;
  return {
    baseKeys: baseKeysOf(word, style),
    toneKey: tone === 'none' ? null : tones[tone],
  };
}

function fullKeys(word: string, style: ToneStyle): string[] {
  const { baseKeys, toneKey } = keyPlan(word, style);
  return toneKey ? [...baseKeys, toneKey] : baseKeys;
}

/** Standard Telex keys for a word, tone key last: việt → v i e e t j. */
export function telexKeys(word: string): string[] {
  return fullKeys(word, 'telex');
}

/** Standard VNI keys for a word, tone key last: việt → v i e 6 t 5. */
export function vniKeys(word: string): string[] {
  return fullKeys(word, 'vni');
}
