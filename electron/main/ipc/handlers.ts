import { existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { BrowserWindow, clipboard, dialog, Menu, shell, type IpcMainInvokeEvent } from 'electron';
import type { SessionMenuAction } from '../../../shared/ipc';
import { titleFromPrompt, type Folder } from '../../../shared/models';
import type { FolderRow, Store } from '../store/repositories';
import type { AgentHub } from '../agents/hub';
import type { AccountsService } from '../services/accounts';
import {
  createWorktree,
  listFiles,
  mergeWorktree,
  rankFiles,
  removeWorktree,
} from '../services/git';
import type { Handlers } from './router';
import { SettingsSchema } from '../../../shared/ipc';

const isGitRepo = (path: string) => existsSync(join(path, '.git'));
const toFolder = (row: FolderRow): Folder => ({ ...row, isGitRepo: isGitRepo(row.path) });

function popup(
  event: IpcMainInvokeEvent,
  items: Electron.MenuItemConstructorOptions[],
  at?: { x: number; y: number },
): Promise<void> {
  return new Promise((resolve) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    Menu.buildFromTemplate(items).popup({
      ...(window ? { window } : {}),
      ...(at ?? {}),
      callback: () => resolve(),
    });
  });
}

export interface HandlerOptions {
  /** Where session worktrees live: <appData>/worktrees/<repo>/<session-slug>. */
  worktreeRoot: () => string;
  /** Sub-sessions still running under a session. */
  runningChildren?: (sessionId: string) => string[];
}

export function createHandlers(
  store: Store,
  hub: AgentHub,
  accounts: AccountsService,
  options: HandlerOptions,
): Handlers {
  const confirm = async (
    event: IpcMainInvokeEvent,
    message: string,
    detail: string,
    ok: string,
  ) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.MessageBoxOptions = {
      type: 'question',
      message,
      detail,
      buttons: [ok, 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    };
    const r = window
      ? await dialog.showMessageBox(window, opts)
      : await dialog.showMessageBox(opts);
    return r.response === 0;
  };

  const notifyError = async (event: IpcMainInvokeEvent, message: string, e: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const opts: Electron.MessageBoxOptions = {
      type: 'error',
      message,
      detail: e instanceof Error ? e.message : String(e),
    };
    if (window) await dialog.showMessageBox(window, opts);
    else await dialog.showMessageBox(opts);
  };

  const sessionRoot = (input: {
    sessionId?: string | undefined;
    folderId?: string | undefined;
  }) => {
    if (input.sessionId) {
      const s = store.sessions.get(input.sessionId);
      if (!s) throw new Error('Unknown session');
      return s.worktreePath ?? s.cwd;
    }
    const f = store.folders.get(input.folderId!);
    if (!f) throw new Error('Unknown folder');
    return f.path;
  };
  const fileCache = new Map<string, { at: number; files: string[] }>();

  const addFolder = (path: string): Folder => {
    if (!statSync(path).isDirectory()) throw new Error('Not a folder');
    return toFolder(store.folders.upsert(path, basename(path) || path));
  };

  const openFolder = async (event: IpcMainInvokeEvent): Promise<Folder | null> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    return addFolder(path);
  };

  return {
    'folders:list': () => store.folders.list().map(toFolder),

    'folders:open': (_input, event) => openFolder(event),

    'folders:choose': async ({ at }, event) => {
      let chosen: Folder | null | 'open' = null;
      const recents = store.folders.list().slice(0, 10);
      await popup(
        event,
        [
          ...recents.map((f) => ({
            label: f.name,
            sublabel: f.path,
            click: () => {
              store.folders.touch(f.id);
              chosen = toFolder({ ...f, lastOpenedAt: Date.now() });
            },
          })),
          ...(recents.length ? [{ type: 'separator' as const }] : []),
          { label: 'Open folder…', click: () => (chosen = 'open') },
        ],
        at,
      );
      const picked = chosen as Folder | null | 'open';
      return picked === 'open' ? openFolder(event) : picked;
    },

    'sessions:list': () => store.sessions.list(),

    'sessions:create': async (input) => {
      const folder = store.folders.get(input.folderId);
      if (!folder) throw new Error('Unknown folder');
      store.folders.touch(folder.id);
      const title = titleFromPrompt(input.prompt);
      // A worktree keeps the session's changes out of the main checkout.
      const worktree =
        input.worktree && isGitRepo(folder.path)
          ? await createWorktree(folder.path, options.worktreeRoot(), title)
          : null;
      const session = store.sessions.create({
        folderId: folder.id,
        agent: input.agent,
        title,
        cwd: folder.path,
        worktreePath: worktree?.path ?? null,
        branch: worktree?.branch ?? null,
        model: input.model,
        effort: input.effort,
        permission: input.permission,
      });
      // The renderer sends the prompt with agent:send, which records it in the render log.
      return session;
    },

    'sessions:rename': ({ id, title }) => store.sessions.rename(id, title),

    'sessions:update': ({ id, ...patch }) => {
      if (!store.sessions.get(id)) throw new Error('Unknown session');
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      return hub.updateSettings(id, clean);
    },

    'fs:files': async (input) => {
      const root = sessionRoot(input);
      const cached = fileCache.get(root);
      const files =
        cached && Date.now() - cached.at < 10_000 ? cached.files : await listFiles(root);
      fileCache.set(root, { at: Date.now(), files });
      return rankFiles(files, input.query);
    },

    'agent:commands': ({ agent }) => hub.adapter(agent).listCommands(),

    'sessions:archive': ({ id }) => {
      store.sessions.archive(id);
      return null;
    },

    'sessions:events': ({ id }) => store.events.list(id),

    'sessions:menu': async ({ id, at }, event) => {
      const session = store.sessions.get(id);
      if (!session) return null;
      let action: SessionMenuAction | null = null;
      const reveal = process.platform === 'darwin' ? 'Reveal in Finder' : 'Reveal in Explorer';
      await popup(
        event,
        [
          { label: 'Rename', click: () => (action = 'rename') },
          { label: 'Archive', click: () => (action = 'archive') },
          { type: 'separator' },
          { label: reveal, click: () => (action = 'reveal') },
          { label: 'Copy session ID', click: () => (action = 'copy-id') },
          ...(session.worktreePath && session.branch
            ? [
                { type: 'separator' as const },
                { label: 'Open worktree', click: () => (action = 'open-worktree') },
                { label: 'Merge into current branch', click: () => (action = 'merge-worktree') },
                { label: 'Remove worktree', click: () => (action = 'remove-worktree') },
              ]
            : []),
        ],
        at,
      );
      const picked = action as SessionMenuAction | null;
      if (picked === 'reveal') shell.showItemInFolder(session.worktreePath ?? session.cwd);
      if (picked === 'copy-id') clipboard.writeText(session.id);
      if (picked === 'open-worktree' && session.worktreePath)
        void shell.openPath(session.worktreePath);
      if (picked === 'merge-worktree' && session.worktreePath && session.branch) {
        const ok = await confirm(
          event,
          `Merge ${session.branch} into the current branch?`,
          `Uncommitted changes in the worktree are committed first, then merged into ${basename(session.cwd)}.`,
          'Merge',
        );
        if (ok) {
          try {
            await mergeWorktree(
              session.cwd,
              { path: session.worktreePath, branch: session.branch },
              `Session: ${session.title}`,
            );
          } catch (e) {
            await notifyError(event, 'Could not merge the worktree', e);
          }
        }
      }
      if (picked === 'remove-worktree' && session.worktreePath) {
        const ok = await confirm(
          event,
          'Remove this worktree?',
          `The folder is deleted; the branch ${session.branch ?? ''} is kept. The session continues in the main checkout.`,
          'Remove',
        );
        if (ok) {
          try {
            await hub.close(session.id);
            await removeWorktree(session.cwd, session.worktreePath);
            store.sessions.update(session.id, { worktreePath: null });
          } catch (e) {
            await notifyError(event, 'Could not remove the worktree', e);
          }
        }
      }
      return picked;
    },

    'agent:status': ({ agent }) => accounts.status(agent),
    'agent:signIn': async ({ agent }) => {
      await accounts.signIn(agent);
      return null;
    },
    'agent:setApiKey': ({ agent, key }) => accounts.setApiKey(agent, key),
    'agent:models': ({ agent }) => hub.adapter(agent).listModels(),
    'agent:send': async ({ sessionId, text }) => {
      await hub.send(sessionId, text);
      return null;
    },
    'agent:interrupt': async ({ sessionId }, event) => {
      await hub.interrupt(sessionId);
      const children = options.runningChildren?.(sessionId) ?? [];
      if (children.length > 0) {
        const n = children.length;
        const stop = await confirm(
          event,
          `Also stop ${n === 1 ? 'its sub-session' : `its ${n} sub-sessions`}?`,
          'Sub-sessions keep running on their own and report back when they finish.',
          n === 1 ? 'Stop sub-session' : 'Stop sub-sessions',
        );
        if (stop) await Promise.all(children.map((id) => hub.interrupt(id)));
      }
      return null;
    },
    'agent:approve': async ({ sessionId, requestId, decision }) => {
      await hub.approve(sessionId, requestId, decision);
      return null;
    },

    'settings:get': () => SettingsSchema.parse(store.settings.all()),

    'settings:set': (patch) => {
      for (const [key, value] of Object.entries(patch)) store.settings.set(key, value);
      return SettingsSchema.parse(store.settings.all());
    },
  };
}
