import { z } from 'zod';
import { AGENT_IDS, PERMISSIONS } from './agents';

export const AgentIdSchema = z.enum(AGENT_IDS);
export const PermissionSchema = z.enum(PERMISSIONS);
export const IdSchema = z.string().min(1).max(64);

export const SESSION_STATUSES = ['idle', 'running', 'waiting', 'error'] as const;
export const SessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const FolderSchema = z.object({
  id: IdSchema,
  path: z.string(),
  name: z.string(),
  lastOpenedAt: z.number(),
  isGitRepo: z.boolean(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const SessionSchema = z.object({
  id: IdSchema,
  folderId: IdSchema,
  parentId: IdSchema.nullable(),
  agent: AgentIdSchema,
  nativeId: z.string().nullable(),
  title: z.string(),
  cwd: z.string(),
  worktreePath: z.string().nullable(),
  branch: z.string().nullable(),
  model: z.string().nullable(),
  effort: z.string().nullable(),
  permission: PermissionSchema,
  status: SessionStatusSchema,
  archived: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Session = z.infer<typeof SessionSchema>;

export const StoredEventSchema = z.object({
  sessionId: IdSchema,
  seq: z.number().int(),
  ts: z.number(),
  type: z.string(),
  payload: z.unknown(),
});
export type StoredEvent = z.infer<typeof StoredEventSchema>;

/** Session titles stay as typed; only the first line is used, capped for storage. */
export const TITLE_MAX = 200;
export function titleFromPrompt(prompt: string): string {
  const line = prompt.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const title = line.trim();
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title || 'New session';
}
