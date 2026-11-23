import { z } from 'zod';
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
export const SettingsSchema = z.object({
  lastAgent: AgentIdSchema.optional(),
  lastFolderId: IdSchema.optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SessionMenuActionSchema = z.enum(['rename', 'archive', 'reveal', 'copy-id']);
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
  'sessions:events': { input: z.object({ id: IdSchema }), output: z.array(StoredEventSchema) },
  /** Native context menu for a session row; reveal and copy are handled in main. */
  'sessions:menu': {
    input: z.object({ id: IdSchema, at: Point.optional() }),
    output: SessionMenuActionSchema.nullable(),
  },

  'settings:get': { input: z.undefined(), output: SettingsSchema },
  'settings:set': { input: SettingsSchema, output: SettingsSchema },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;
