import { describe, expect, it } from 'vitest';
import {
  hasDiacritics,
  isVietnameseSyllable,
  looseMatchVi,
  normalizeToneStyle,
  splitTone,
  strictEqualVi,
  stripAll,
  telexKeys,
  vniKeys,
} from './vietnamese';

const keys = (s: string): string[] => s.split(' ');

describe('splitTone / strict match', () => {
  it('accepts old and new tone placement', () => {
    expect(strictEqualVi('hoà', 'hòa')).toBe(true);
    expect(strictEqualVi('thuỷ', 'thủy')).toBe(true);
    expect(strictEqualVi('khoẻ', 'khỏe')).toBe(true);
    expect(strictEqualVi('hoàng', 'hoàng')).toBe(true);
  });

  it('treats NFD and NFC as the same word', () => {
    const nfd = 'việt'.normalize('NFD');
    expect(nfd).not.toBe('việt');
    expect(strictEqualVi(nfd, 'việt')).toBe(true);
  });

  it('distinguishes every tone', () => {
    const words = ['ma', 'má', 'mà', 'mả', 'mã', 'mạ'];
    for (const a of words) {
      for (const b of words) expect(strictEqualVi(a, b)).toBe(a === b);
    }
  });

  it('distinguishes vowel shapes and đ', () => {
    expect(strictEqualVi('da', 'đa')).toBe(false);
    expect(strictEqualVi('tho', 'thơ')).toBe(false);
    expect(strictEqualVi('thơ', 'thô')).toBe(false);
    expect(strictEqualVi('tho', 'thô')).toBe(false);
  });

  it('splits skeleton and tone', () => {
    expect(splitTone('việt')).toEqual({ skeleton: 'viêt', tone: 'nang' });
    expect(splitTone('đường')).toEqual({ skeleton: 'đương', tone: 'huyen' });
    expect(splitTone('không')).toEqual({ skeleton: 'không', tone: 'none' });
  });
});

describe('loose match while typing', () => {
  it('accepts every Telex intermediate state of "việt"', () => {
    for (const t of ['v', 'vi', 'vie', 'viê', 'việ', 'việt']) {
      expect(looseMatchVi(t, 'việt')).toBe(true);
    }
  });
  it('rejects raw Telex when the IME is off', () => {
    expect(looseMatchVi('vieej', 'việt')).toBe(false);
  });
  it('accepts d for đ', () => {
    expect(looseMatchVi('d', 'đi')).toBe(true);
  });
  it('strips all accents', () => {
    expect(stripAll('Đường')).toBe('duong');
    expect(hasDiacritics('duong')).toBe(false);
    expect(hasDiacritics('đi')).toBe(true);
  });
});

describe('telexKeys', () => {
  it.each([
    ['việt', 'v i e e t j'],
    ['đường', 'd d u w o w n g f'],
    ['người', 'n g u w o w i f'],
    ['không', 'k h o o n g'],
    ['của', 'c u a r'],
    ['những', 'n h u w n g x'],
    ['được', 'd d u w o w c j'],
  ])('%s → %s', (word, expected) => {
    expect(telexKeys(word)).toEqual(keys(expected));
  });
});

describe('vniKeys', () => {
  it.each([
    ['việt', 'v i e 6 t 5'],
    ['đường', 'd 9 u 7 o 7 n g 2'],
  ])('%s → %s', (word, expected) => {
    expect(vniKeys(word)).toEqual(keys(expected));
  });
});

describe('isVietnameseSyllable', () => {
  it.each([
    'nghiêng',
    'quyết',
    'giữ',
    'không',
    'người',
    'được',
    'quen',
    'gì',
    'khuya',
    'yêu',
    'ạ',
    'xoong',
  ])('accepts %s', (w) => expect(isVietnameseSyllable(w)).toBe(true));
  it.each(['abc', 'ngh', 'you', 'this', 'hello', 'okay', 'cé', 'kan', 'ghá', 'mátt', 'hàt', 'máà'])(
    'rejects %s',
    (w) => expect(isVietnameseSyllable(w)).toBe(false),
  );
  it('accepts "the": it is a real Vietnamese syllable (vải the)', () => {
    // English leaks such as "the" are removed by the word-list blocklist instead.
    expect(isVietnameseSyllable('the')).toBe(true);
  });
});

describe('normalizeToneStyle', () => {
  it.each([
    ['hoà', 'hòa'],
    ['thuỷ', 'thủy'],
    ['khoẻ', 'khỏe'],
    ['hoàng', 'hoàng'],
    ['quá', 'quá'],
    ['giữ', 'giữ'],
    ['gì', 'gì'],
    ['người', 'người'],
    ['ngoài', 'ngoài'],
    ['tuổi', 'tuổi'],
    ['chuyện', 'chuyện'],
    ['nghĩa', 'nghĩa'],
    ['giường', 'giường'],
  ])('%s → %s', (input, expected) => {
    // Feed a version with the mark moved to a wrong vowel where possible.
    expect(normalizeToneStyle(input)).toBe(expected);
  });
  it('moves a misplaced mark', () => {
    expect(normalizeToneStyle('ngòai')).toBe('ngoài');
    expect(normalizeToneStyle('tuôỉ')).toBe('tuổi');
  });
});
