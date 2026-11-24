import { z } from 'zod';
import { AccountStatusSchema, ApprovalDecisionSchema, ModelInfoSchema } from './events';
import {
  AgentIdSchema,
  FolderSchema,
  IdSchema,
  PermissionSchema,
  SessionSchema,
  StoredEventSchema,
  TITLE_MAX,
} from './models';

/** Settings the renderer may read and write. */
const AgentDefaultsSchema = z.object({
  model: z.string().max(200).optional(),
  effort: z.string().max(50).optional(),
  permission: PermissionSchema.optional(),
});
export type AgentDefaults = z.infer<typeof AgentDefaultsSchema>;

export const SettingsSchema = z.object({
  lastAgent: AgentIdSchema.optional(),
  lastFolderId: IdSchema.optional(),
  /** Last model, effort and permission chosen per agent on the Welcome screen. */
  agentDefaults: z.partialRecord(AgentIdSchema, AgentDefaultsSchema).optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SessionMenuActionSchema = z.enum([
  'rename',
  'archive',
  'reveal',
  'copy-id',
  'open-worktree',
  'merge-worktree',
  'remove-worktree',
]);
export type SessionMenuAction = z.infer<typeof SessionMenuActionSchema>;

const Point = z.object({ x: z.number().int(), y: z.number().int() });

/**
 * Every invoke channel with its input and output schema. Main validates each input before
 * the handler runs and each output before it is returned.
 */
export const ipcContract = {
  'folders:list': { input: z.undefined(), output: z.array(FolderSchema) },
  /** Native menu of recent folders plus "Open folder…"; returns the chosen folder. */
  'folders:choose': { input: z.object({ at: Point.optional() }), output: FolderSchema.nullable() },
  /** System folder picker. */
  'folders:open': { input: z.undefined(), output: FolderSchema.nullable() },

  'sessions:list': { input: z.undefined(), output: z.array(SessionSchema) },
  'sessions:create': {
    input: z.object({
      folderId: IdSchema,
      agent: AgentIdSchema,
      prompt: z.string().min(1).max(100_000),
      model: z.string().max(200).nullable(),
      effort: z.string().max(50).nullable(),
      permission: PermissionSchema,
      worktree: z.boolean(),
    }),
    output: SessionSchema,
  },
  'sessions:rename': {
    input: z.object({ id: IdSchema, title: z.string().trim().min(1).max(TITLE_MAX) }),
    output: SessionSchema,
  },
  'sessions:archive': { input: z.object({ id: IdSchema }), output: z.null() },
  /** Model, effort or permission mid-session; the agent applies it live or between turns. */
  'sessions:update': {
    input: z.object({
      id: IdSchema,
      model: z.string().min(1).max(200).optional(),
      effort: z.string().min(1).max(50).optional(),
      permission: PermissionSchema.optional(),
    }),
    output: SessionSchema,
  },
  /** Files for the @ picker, relative to a session's folder (or a folder before a session starts). */
  'fs:files': {
    input: z
      .object({
        sessionId: IdSchema.optional(),
        folderId: IdSchema.optional(),
        query: z.string().max(200),
      })
      .refine((v) => !!v.sessionId !== !!v.folderId, 'Pass a session or a folder'),
    output: z.array(z.string()),
  },
  // Right rail panels. Paths are relative to the session's folder (or worktree).
  'fs:tree': { input: z.object({ sessionId: IdSchema }), output: z.array(z.string()) },
  'fs:read': {
    input: z.object({ sessionId: IdSchema, path: z.string().min(1).max(4096) }),
    output: z.object({
      content: z.string().nullable(),
      binary: z.boolean(),
      tooLarge: z.boolean(),
      size: z.number(),
    }),
  },
  /** Opens the file in the system's default app for it. */
  'fs:open': {
    input: z.object({ sessionId: IdSchema, path: z.string().min(1).max(4096) }),
    output: z.null(),
  },
  'git:status': {
    input: z.object({ sessionId: IdSchema }),
    output: z
      .object({
        branch: z.string().nullable(),
        ahead: z.number(),
        behind: z.number(),
        files: z.array(z.object({ path: z.string(), index: z.string(), workingDir: z.string() })),
      })
      .nullable(),
  },
  'git:diff': {
    input: z.object({
      sessionId: IdSchema,
      path: z.string().min(1).max(4096),
      staged: z.boolean(),
    }),
    output: z.string(),
  },
  'git:stage': {
    input: z.object({
      sessionId: IdSchema,
      paths: z.array(z.string().min(1).max(4096)).min(1).max(1000),
    }),
    output: z.null(),
  },
  'git:unstage': {
    input: z.object({
      sessionId: IdSchema,
      paths: z.array(z.string().min(1).max(4096)).min(1).max(1000),
    }),
    output: z.null(),
  },
  'git:commit': {
    input: z.object({ sessionId: IdSchema, message: z.string().trim().min(1).max(10_000) }),
    output: z.string(),
  },
  'pty:create': {
    input: z.object({
      sessionId: IdSchema,
      cols: z.number().int().min(2).max(1000),
      rows: z.number().int().min(2).max(1000),
    }),
    output: z.object({ id: z.string(), sessionId: z.string(), title: z.string() }),
  },
  'pty:list': {
    input: z.object({ sessionId: IdSchema }),
    output: z.array(z.object({ id: z.string(), sessionId: z.string(), title: z.string() })),
  },
  'pty:write': {
    input: z.object({ id: z.string().max(64), data: z.string().max(100_000) }),
    output: z.null(),
  },
  'pty:resize': {
    input: z.object({
      id: z.string().max(64),
      cols: z.number().int().min(2).max(1000),
      rows: z.number().int().min(2).max(1000),
    }),
    output: z.null(),
  },
  'pty:kill': { input: z.object({ id: z.string().max(64) }), output: z.null() },
  'browser:show': {
    input: z.object({
      bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number().min(0),
        height: z.number().min(0),
      }),
      url: z.string().max(4096).optional(),
    }),
    output: z.null(),
  },
  'browser:hide': { input: z.undefined(), output: z.null() },
  /** Returns the normalized URL, or null when it is not a web address. */
  'browser:navigate': {
    input: z.object({ url: z.string().max(4096) }),
    output: z.string().nullable(),
  },
  'browser:action': {
    input: z.object({ action: z.enum(['back', 'forward', 'reload']) }),
    output: z.null(),
  },
  'browser:devServers': { input: z.undefined(), output: z.array(z.string()) },

  'agent:commands': {
    input: z.object({ agent: AgentIdSchema }),
    output: z.array(z.object({ name: z.string(), description: z.string() })),
  },
  'sessions:events': { input: z.object({ id: IdSchema }), output: z.array(StoredEventSchema) },
  /** Native context menu for a session row; reveal and copy are handled in main. */
  'sessions:menu': {
    input: z.object({ id: IdSchema, at: Point.optional() }),
    output: SessionMenuActionSchema.nullable(),
  },

  'agent:status': { input: z.object({ agent: AgentIdSchema }), output: AccountStatusSchema },
  /** Opens the vendor's own sign-in flow in a terminal. */
  'agent:signIn': { input: z.object({ agent: AgentIdSchema }), output: z.null() },
  /** Stores (or with null, removes) an API key with safeStorage; never returned to the renderer. */
  'agent:setApiKey': {
    input: z.object({ agent: AgentIdSchema, key: z.string().trim().min(10).max(500).nullable() }),
    output: AccountStatusSchema,
  },
  'agent:models': { input: z.object({ agent: AgentIdSchema }), output: z.array(ModelInfoSchema) },
  'agent:send': {
    input: z.object({ sessionId: IdSchema, text: z.string().min(1).max(200_000) }),
    output: z.null(),
  },
  'agent:interrupt': { input: z.object({ sessionId: IdSchema }), output: z.null() },
  'agent:approve': {
    input: z.object({
      sessionId: IdSchema,
      requestId: z.string().min(1).max(200),
      decision: ApprovalDecisionSchema,
    }),
    output: z.null(),
  },

  'settings:get': { input: z.undefined(), output: SettingsSchema },
  'settings:set': { input: SettingsSchema, output: SettingsSchema },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;
