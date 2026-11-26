import { describe, expect, it } from 'vitest';
import { aggregateKeys } from './keyStats';

describe('aggregateKeys', () => {
  it('counts keys and times gaps up to 2000ms', () => {
    const stats = aggregateKeys([
      { code: 'KeyA', t: 0 },
      { code: 'KeyB', t: 200 },
      { code: 'KeyA', t: 500 },
      { code: 'KeyA', t: 5000 }, // pause: not timed
    ]);
    expect(stats['KeyA']).toEqual({ count: 3, totalMs: 300, timedCount: 1, errors: 0 });
    expect(stats['KeyB']).toEqual({ count: 1, totalMs: 200, timedCount: 1, errors: 0 });
  });
});
