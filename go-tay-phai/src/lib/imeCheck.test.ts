import { describe, expect, it } from 'vitest';
import { detectImeIssue } from './imeCheck';
import type { WordResult } from './scoring';

const r = (target: string, typed: string): WordResult => ({
  target,
  typed,
  correct: target === typed,
});

describe('detectImeIssue', () => {
  it('English test with Vietnamese characters → IME is on', () => {
    expect(detectImeIssue('en', [], 'thê', 'the')).toBe('vi-ime-on');
    expect(detectImeIssue('en', [r('you', 'yơu')], '', 'the')).toBe('vi-ime-on');
    expect(detectImeIssue('en', [r('you', 'you')], 'th', 'the')).toBeNull();
  });
  it('Vietnamese test with raw Telex → IME is off', () => {
    expect(detectImeIssue('vi', [], 'vieej', 'việt')).toBe('vi-ime-off');
    expect(detectImeIssue('vi', [], 'vietj', 'việt')).toBe('vi-ime-off');
    expect(detectImeIssue('vi', [], 'ddi', 'đi')).toBe('vi-ime-off');
    expect(detectImeIssue('vi', [], 'vie', 'việt')).toBeNull();
    expect(detectImeIssue('vi', [], 'sa', 'sao')).toBeNull();
  });
  it('accented words always typed without accents → IME is off', () => {
    const plain = [r('tôi', 'toi'), r('là', 'la'), r('anh', 'anh'), r('có', 'co'), r('em', 'em')];
    expect(detectImeIssue('vi', plain, '', 'không')).toBe('vi-ime-off');
    const good = [r('tôi', 'tôi'), r('là', 'la'), r('anh', 'anh'), r('có', 'có'), r('em', 'em')];
    expect(detectImeIssue('vi', good, '', 'không')).toBeNull();
  });
});
