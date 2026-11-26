/** Seeded random numbers and word sequence generation. Pure, no React. */

export type Rng = () => number;

/** mulberry32: small, fast, seedable PRNG returning numbers in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh random seed for a new test. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Number of most recent words a new word must differ from. */
export const NO_REPEAT_WINDOW = 5;

function pickAvoiding(
  pool: readonly string[],
  recent: readonly string[],
  next: (candidates: readonly string[]) => string,
): string {
  const blocked = new Set(recent.slice(-NO_REPEAT_WINDOW));
  const candidates = pool.filter((w) => !blocked.has(w));
  return next(candidates.length > 0 ? candidates : pool);
}

/**
 * Picks `count` words uniformly from `pool`; a word never repeats within the
 * last 5 words. `history` is the tail of an existing sequence when extending it.
 */
export function generateWords(
  pool: readonly string[],
  count: number,
  seed: number,
  history: readonly string[] = [],
): string[] {
  if (pool.length === 0 || count <= 0) return [];
  const rng = mulberry32(seed);
  const out: string[] = [];
  const recent = [...history.slice(-NO_REPEAT_WINDOW)];
  for (let i = 0; i < count; i++) {
    const word = pickAvoiding(
      pool,
      recent,
      (c) => c[Math.floor(rng() * c.length)] ?? (c[0] as string),
    );
    out.push(word);
    recent.push(word);
    if (recent.length > NO_REPEAT_WINDOW) recent.shift();
  }
  return out;
}

/**
 * Picks words with probability proportional to `weightFn(word)` (weights <= 0
 * are skipped unless every weight is <= 0). Same no-repeat rule as generateWords.
 */
export function generateWeighted(
  pool: readonly string[],
  weightFn: (word: string) => number,
  count: number,
  seed: number,
  history: readonly string[] = [],
): string[] {
  if (pool.length === 0 || count <= 0) return [];
  const weights = new Map(pool.map((w) => [w, Math.max(0, weightFn(w))]));
  const rng = mulberry32(seed);
  const out: string[] = [];
  const recent = [...history.slice(-NO_REPEAT_WINDOW)];
  const choose = (candidates: readonly string[]): string => {
    const total = candidates.reduce((s, w) => s + (weights.get(w) ?? 0), 0);
    if (total <= 0)
      return candidates[Math.floor(rng() * candidates.length)] ?? (candidates[0] as string);
    let r = rng() * total;
    for (const w of candidates) {
      r -= weights.get(w) ?? 0;
      if (r < 0) return w;
    }
    return candidates[candidates.length - 1] as string;
  };
  for (let i = 0; i < count; i++) {
    const word = pickAvoiding(pool, recent, choose);
    out.push(word);
    recent.push(word);
    if (recent.length > NO_REPEAT_WINDOW) recent.shift();
  }
  return out;
}
