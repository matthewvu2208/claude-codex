/** Per-key timing aggregation (plan §9). Pure, no React. */

import type { KeyStat } from './storage';

export interface KeyEvent {
  code: string;
  t: number;
}

/** Gaps longer than this are treated as a pause and not timed. */
export const MAX_GAP_MS = 2000;

export function aggregateKeys(events: readonly KeyEvent[]): Record<string, KeyStat> {
  const out: Record<string, KeyStat> = {};
  let prev: number | null = null;
  for (const e of events) {
    const s = (out[e.code] ??= { count: 0, totalMs: 0, timedCount: 0, errors: 0 });
    s.count++;
    if (prev !== null) {
      const gap = e.t - prev;
      if (gap >= 0 && gap <= MAX_GAP_MS) {
        s.totalMs += gap;
        s.timedCount++;
      }
    }
    prev = e.t;
  }
  return out;
}
