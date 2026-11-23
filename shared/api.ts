export type Platform = 'darwin' | 'win32' | 'linux';

/**
 * The typed bridge exposed on `window.api` by the preload script.
 * Domains (sessions, agents, fs, git, pty, usage) are added milestone by milestone,
 * each validated with zod schemas from this folder.
 */
export interface Api {
  readonly app: {
    readonly platform: Platform;
  };
}
