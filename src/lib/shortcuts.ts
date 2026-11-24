import { isMac, shortcut } from './platform';

/** Every keyboard shortcut, as Settings › Shortcuts lists them. */
export const SHORTCUTS: { action: string; keys: string }[] = [
  { action: 'New session', keys: shortcut('N') },
  { action: 'Commands', keys: shortcut('K') },
  { action: 'Settings', keys: shortcut(',') },
  { action: 'Send message', keys: 'Enter' },
  { action: 'New line', keys: isMac ? '⇧Enter' : 'Shift Enter' },
  { action: 'Stop the agent', keys: 'Esc' },
  { action: 'Ask about selected text', keys: shortcut('A', { shift: true }) },
  { action: 'Insert a file path', keys: '@' },
  { action: 'Insert a command', keys: '/' },
  { action: 'Resize the side pane', keys: '← →' },
];

/** Cmd on macOS, Ctrl elsewhere, without Shift or Alt. */
export function isModKey(e: KeyboardEvent, key: string): boolean {
  const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  return mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === key;
}
