import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { BrowserWindow, clipboard, dialog, Menu, shell, type IpcMainInvokeEvent } from 'electron';
import type { SessionMenuAction } from '../../../shared/ipc';
import { titleFromPrompt, type Folder } from '../../../shared/models';
import type { FolderRow, Store } from '../store/repositories';
import type { AgentHub } from '../agents/hub';
import type { AccountsService } from '../services/accounts';
import { detectDevServers, type BrowserPanel } from '../services/browser';
import { readPreview, resolveInside } from '../services/files';
import {
  createWorktree,
  gitCommit,
  gitDiff,
  gitStage,
  gitStatus,
  gitUnstage,
  listFiles,
  mergeWorktree,
  rankFiles,
  removeWorktree,
} from '../services/git';
import type { PtyManager } from '../services/pty';
import type { UsageService } from '../services/usage';
import type { AttachmentStore } from '../services/attachments';
import { MAX_ATTACHMENTS } from '../../../shared/attachments';
import type { Handlers } from './router';
import { SettingsSchema, type Settings } from '../../../shared/ipc';

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
  /** Default home of session worktrees: <appData>/worktrees/<repo>/<session-slug>. */
  worktreeRoot: () => string;
  /** Copies of attached files. */
  attachments?: AttachmentStore;
  /** The folder chats without a project run in. */
  chatsRoot?: () => string;
  /** App version and log folder for Settings. */
  appInfo?: () => { version: string; logsPath: string };
  /** Called after settings change (e.g. to apply the text size). */
  onSettingsChanged?: (s: Settings) => void;
  /** Sub-sessions still running under a session. */
  runningChildren?: (sessionId: string) => string[];
  pty?: PtyManager;
  browser?: BrowserPanel;
  usage?: UsageService;
}

export function createHandlers(
  store: Store,
  hub: AgentHub,
  accounts: AccountsService,
  options: HandlerOptions,
): Handlers {
  /** The chosen worktree folder, or the default one. */
  const worktreeRoot = () => {
    const chosen = SettingsSchema.shape.worktreeRoot.safeParse(
      store.settings.all()['worktreeRoot'],
    );
    return (chosen.success && chosen.data) || options.worktreeRoot();
  };
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

    'folders:chats': () => {
      const root = options.chatsRoot?.() ?? join(worktreeRoot(), '..', 'chats');
      mkdirSync(root, { recursive: true });
      return toFolder(store.folders.upsert(root, 'Chats'));
    },

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
          ? await createWorktree(folder.path, worktreeRoot(), title)
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

    'fs:tree': async ({ sessionId }) => listFiles(sessionRoot({ sessionId })),
    'fs:read': ({ sessionId, path }) => readPreview(sessionRoot({ sessionId }), path),
    'fs:open': async ({ sessionId, path }) => {
      const full = resolveInside(sessionRoot({ sessionId }), path);
      const error = await shell.openPath(full);
      if (error) throw new Error(error);
      return null;
    },

    'git:status': async ({ sessionId }) => {
      const root = sessionRoot({ sessionId });
      return isGitRepo(root) ? gitStatus(root) : null;
    },
    'git:diff': ({ sessionId, path, staged }) => {
      const root = sessionRoot({ sessionId });
      resolveInside(root, path);
      return gitDiff(root, path, staged);
    },
    'git:stage': async ({ sessionId, paths }) => {
      const root = sessionRoot({ sessionId });
      paths.forEach((p) => resolveInside(root, p));
      await gitStage(root, paths);
      return null;
    },
    'git:unstage': async ({ sessionId, paths }) => {
      const root = sessionRoot({ sessionId });
      paths.forEach((p) => resolveInside(root, p));
      await gitUnstage(root, paths);
      return null;
    },
    'git:commit': ({ sessionId, message }) => gitCommit(sessionRoot({ sessionId }), message),

    'pty:create': ({ sessionId, cols, rows }) => {
      if (!options.pty) throw new Error('Terminals are not available');
      return options.pty.create(sessionId, sessionRoot({ sessionId }), cols, rows);
    },
    'pty:list': ({ sessionId }) => options.pty?.list(sessionId) ?? [],
    'pty:write': ({ id, data }) => {
      options.pty?.write(id, data);
      return null;
    },
    'pty:resize': ({ id, cols, rows }) => {
      options.pty?.resize(id, cols, rows);
      return null;
    },
    'pty:kill': ({ id }) => {
      options.pty?.kill(id);
      return null;
    },

    'browser:show': ({ bounds, url }) => {
      options.browser?.show(bounds, url);
      return null;
    },
    'browser:hide': () => {
      options.browser?.hide();
      return null;
    },
    'browser:navigate': ({ url }) => options.browser?.navigate(url) ?? null,
    'browser:action': ({ action }) => {
      options.browser?.action(action);
      return null;
    },
    'browser:devServers': () => detectDevServers(),

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
    'agent:send': async ({ sessionId, text, attachments }) => {
      const files = (attachments ?? []).map((id) => {
        const a = options.attachments?.get(id);
        if (!a) throw new Error('An attached file is no longer available. Attach it again.');
        return a;
      });
      await hub.send(sessionId, text, files);
      return null;
    },

    'attachments:pick': async (_input, event) => {
      const store_ = options.attachments;
      if (!store_) return [];
      const window = BrowserWindow.fromWebContents(event.sender);
      const opts: Electron.OpenDialogOptions = {
        title: 'Attach files',
        buttonLabel: 'Attach',
        properties: ['openFile', 'multiSelections'],
      };
      const r = window
        ? await dialog.showOpenDialog(window, opts)
        : await dialog.showOpenDialog(opts);
      if (r.canceled) return [];
      return r.filePaths.slice(0, MAX_ATTACHMENTS).map((p) => store_.addPath(p));
    },

    'attachments:addPaths': ({ paths }) => {
      const store_ = options.attachments;
      if (!store_) return [];
      return paths.map((p) => store_.addPath(p));
    },

    'attachments:addData': ({ name, data }) => {
      if (!options.attachments) throw new Error('Attachments are not available');
      return options.attachments.addData(name, data);
    },

    'attachments:preview': ({ id }) => options.attachments?.preview(id) ?? null,
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

    'usage:read': async ({ refresh }) => {
      if (!options.usage) return { claude: null, codex: null };
      return refresh ? options.usage.refresh() : options.usage.read();
    },

    'app:info': () => ({
      version: options.appInfo?.().version ?? '0.0.0',
      logsPath: options.appInfo?.().logsPath ?? '',
      defaultWorktreeRoot: options.worktreeRoot(),
    }),

    'app:openLogs': async () => {
      const dir = options.appInfo?.().logsPath;
      if (dir) await shell.openPath(dir);
      return null;
    },

    'settings:chooseWorktreeRoot': async (_input, event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options_: Electron.OpenDialogOptions = {
        title: 'Choose where worktrees go',
        buttonLabel: 'Choose',
        properties: ['openDirectory', 'createDirectory'],
      };
      const r = window
        ? await dialog.showOpenDialog(window, options_)
        : await dialog.showOpenDialog(options_);
      const path = r.canceled ? null : (r.filePaths[0] ?? null);
      if (!path) return null;
      store.settings.set('worktreeRoot', path);
      options.onSettingsChanged?.(SettingsSchema.parse(store.settings.all()));
      return path;
    },

    'settings:get': () => SettingsSchema.parse(store.settings.all()),

    'settings:set': (patch) => {
      for (const [key, value] of Object.entries(patch)) store.settings.set(key, value);
      const next = SettingsSchema.parse(store.settings.all());
      options.onSettingsChanged?.(next);
      return next;
    },
  };
}
