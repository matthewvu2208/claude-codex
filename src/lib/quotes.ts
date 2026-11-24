export const QUOTE_LIMIT = 3;
export const QUOTE_MAX_CHARS = 2000;

export interface Quote {
  id: string;
  /** "Selected text", or "Selected text · pricing.ts:11" next to a file path. */
  label: string;
  text: string;
}

/** Matches an inline code path like `review-test/pricing.ts:11` (line optional). */
const PATH_RE = /^[\w./\\-]*[\w-]+\.[A-Za-z0-9]+(?::(\d+|\[[^\]]*\]))?$/;

/** "review-test/pricing.ts:11" → "pricing.ts:11"; null when the text is not a path. */
export function pathLabel(code: string): string | null {
  const t = code.trim();
  if (!PATH_RE.test(t)) return null;
  const base = t.split(/[\\/]/).pop()!;
  return base;
}

export function quoteLabel(path: string | null): string {
  return path ? `Selected text · ${path}` : 'Selected text';
}

export function cutQuote(text: string): string {
  const t = text.trim();
  return t.length > QUOTE_MAX_CHARS ? `${t.slice(0, QUOTE_MAX_CHARS - 1)}…` : t;
}

/** Each quote as a markdown blockquote with its label, then the question. */
export function composeMessage(quotes: readonly Quote[], question: string): string {
  const blocks = quotes.map((q) =>
    [`> ${q.label}`, '>', ...q.text.split(/\r?\n/).map((l) => (l ? `> ${l}` : '>'))].join('\n'),
  );
  return [...blocks, question.trim()].filter(Boolean).join('\n\n');
}
