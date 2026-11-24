export interface Trigger {
  mode: 'file' | 'command';
  /** Where the token starts and ends in the text. */
  start: number;
  end: number;
  query: string;
}

/** Finds an `@file` token under the caret, or a `/command` at the very start. */
export function findTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const start =
    Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n'), before.lastIndexOf('\t')) + 1;
  const token = before.slice(start);
  if (token.startsWith('@')) return { mode: 'file', start, end: caret, query: token.slice(1) };
  if (start === 0 && token.startsWith('/') && !token.includes('/', 1)) {
    return { mode: 'command', start, end: caret, query: token.slice(1) };
  }
  return null;
}
