import { describe, expect, it } from 'vitest';
import {
  composeMessage,
  cutQuote,
  pathLabel,
  quoteLabel,
  QUOTE_MAX_CHARS,
} from '../../src/lib/quotes';

describe('select-to-ask quotes', () => {
  it('labels a quote with the file and line next to it', () => {
    expect(pathLabel('review-test/pricing.ts:11')).toBe('pricing.ts:11');
    expect(pathLabel('src\\a.ts')).toBe('a.ts');
    expect(pathLabel('utils.ts:[line]')).toBe('utils.ts:[line]');
    expect(pathLabel('npm test')).toBeNull();
    expect(pathLabel('42')).toBeNull();
    expect(quoteLabel('pricing.ts:11')).toBe('Selected text · pricing.ts:11');
    expect(quoteLabel(null)).toBe('Selected text');
  });

  it('cuts quotes at 2,000 characters', () => {
    expect(cutQuote('x'.repeat(5000))).toHaveLength(QUOTE_MAX_CHARS);
    expect(cutQuote('  short  ')).toBe('short');
  });

  it('sends each quote as a labeled blockquote, then the question', () => {
    const text = composeMessage(
      [
        { id: '1', label: 'Selected text · a.ts:1', text: 'line one\n\nline three' },
        { id: '2', label: 'Selected text', text: 'other' },
      ],
      '  Why?  ',
    );
    expect(text).toBe(
      '> Selected text · a.ts:1\n>\n> line one\n>\n> line three\n\n> Selected text\n>\n> other\n\nWhy?',
    );
    expect(composeMessage([], 'Plain')).toBe('Plain');
  });
});
