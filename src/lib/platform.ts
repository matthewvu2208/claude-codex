import type { Platform } from '../../shared/api';

export const platform: Platform = window.api?.app.platform ?? 'darwin';
export const isMac = platform === 'darwin';

/** Shortcut label for the current OS: "⌘K" on macOS, "Ctrl K" elsewhere. */
export function shortcut(key: string, opts: { shift?: boolean } = {}): string {
  if (isMac) return `${opts.shift ? '⇧' : ''}⌘${key}`;
  return `Ctrl ${opts.shift ? 'Shift ' : ''}${key}`;
}
