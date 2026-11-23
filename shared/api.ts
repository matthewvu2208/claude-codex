/**
 * The typed bridge exposed on `window.api` by the preload script.
 * Domains (sessions, agents, fs, git, pty, usage) are added in later milestones,
 * each validated with zod schemas from this folder.
 */
export type Api = Readonly<Record<never, never>>;
