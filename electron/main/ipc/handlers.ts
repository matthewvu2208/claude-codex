import { existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { BrowserWindow, clipboard, dialog, Menu, shell, type IpcMainInvokeEvent } from 'electron';
import type { SessionMenuAction } from '../../../shared/ipc';
import { titleFromPrompt, type Folder } from '../../../shared/models';
import type { FolderRow, Store } from '../store/repositories';
import type { AgentHub } from '../agents/hub';
import type { AccountsService } from '../services/accounts';
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

export function createHandlers(store: Store, hub: AgentHub, accounts: AccountsService): Handlers {
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

    'sessions:create': (input) => {
      const folder = store.folders.get(input.folderId);
      if (!folder) throw new Error('Unknown folder');
      store.folders.touch(folder.id);
      const session = store.sessions.create({
        folderId: folder.id,
        agent: input.agent,
        title: titleFromPrompt(input.prompt),
        cwd: folder.path,
        model: input.model,
        effort: input.effort,
        permission: input.permission,
      });
      // The renderer sends the prompt with agent:send, which records it in the render log.
      return session;
    },

    'sessions:rename': ({ id, title }) => store.sessions.rename(id, title),

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
        ],
        at,
      );
      const picked = action as SessionMenuAction | null;
      if (picked === 'reveal') shell.showItemInFolder(session.worktreePath ?? session.cwd);
      if (picked === 'copy-id') clipboard.writeText(session.id);
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
    'agent:interrupt': async ({ sessionId }) => {
      await hub.interrupt(sessionId);
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
