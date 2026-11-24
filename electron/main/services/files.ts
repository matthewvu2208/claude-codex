import { openSync, readSync, closeSync, statSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export const PREVIEW_LIMIT = 512 * 1024;

/**
 * Resolves a path the renderer sent (relative to the session folder) and refuses anything that
 * lands outside that folder, including through `..` or symlinks.
 */
export function resolveInside(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error('Paths must be relative to the session folder');
  const full = resolve(root, rel);
  const real = (p: string) => {
    try {
      return realpathSync.native(p);
    } catch {
      return p;
    }
  };
  const r = relative(real(root), real(full));
  if (r.startsWith('..') || isAbsolute(r))
    throw new Error('That file is outside the session folder');
  return full;
}

export interface FilePreview {
  content: string | null;
  binary: boolean;
  tooLarge: boolean;
  size: number;
}

/** Text of a file for the read-only preview; binary and very large files are not read whole. */
export function readPreview(root: string, rel: string): FilePreview {
  const full = resolveInside(root, rel);
  const st = statSync(full);
  if (!st.isFile()) throw new Error('Not a file');
  const length = Math.min(st.size, PREVIEW_LIMIT);
  const buf = Buffer.alloc(length);
  const fd = openSync(full, 'r');
  try {
    readSync(fd, buf, 0, length, 0);
  } finally {
    closeSync(fd);
  }
  const binary = buf.subarray(0, 8000).includes(0);
  return {
    content: binary ? null : buf.toString('utf8'),
    binary,
    tooLarge: st.size > PREVIEW_LIMIT,
    size: st.size,
  };
}
