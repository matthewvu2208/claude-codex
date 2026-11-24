import { contextBridge, ipcRenderer } from 'electron';
import type { Api, Platform } from '../../shared/api';
import type { IpcChannel } from '../../shared/ipc';

// The preload stays free of runtime dependencies (sandboxed preloads cannot require them);
// main validates every payload with the zod contract in shared/ipc.ts.
const invoke =
  (channel: IpcChannel) =>
  (input?: unknown): Promise<never> =>
    ipcRenderer.invoke(channel, input) as Promise<never>;

const subscribe =
  (channel: string) =>
  (cb: (payload: unknown) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };

const platform: Platform =
  process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux';

const api: Api = {
  app: { platform },
  folders: {
    list: invoke('folders:list'),
    choose: invoke('folders:choose'),
    open: invoke('folders:open'),
  },
  sessions: {
    list: invoke('sessions:list'),
    create: invoke('sessions:create'),
    rename: invoke('sessions:rename'),
    archive: invoke('sessions:archive'),
    update: invoke('sessions:update'),
    events: invoke('sessions:events'),
    menu: invoke('sessions:menu'),
  },
  fs: {
    files: invoke('fs:files'),
    tree: invoke('fs:tree'),
    read: invoke('fs:read'),
    open: invoke('fs:open'),
  },
  git: {
    status: invoke('git:status'),
    diff: invoke('git:diff'),
    stage: invoke('git:stage'),
    unstage: invoke('git:unstage'),
    commit: invoke('git:commit'),
  },
  pty: {
    create: invoke('pty:create'),
    list: invoke('pty:list'),
    write: invoke('pty:write'),
    resize: invoke('pty:resize'),
    kill: invoke('pty:kill'),
    onData: subscribe('pty:data'),
    onExit: subscribe('pty:exit'),
  },
  browser: {
    show: invoke('browser:show'),
    hide: invoke('browser:hide'),
    navigate: invoke('browser:navigate'),
    action: invoke('browser:action'),
    devServers: invoke('browser:devServers'),
    onState: subscribe('browser:state'),
  },
  agent: {
    commands: invoke('agent:commands'),
    status: invoke('agent:status'),
    signIn: invoke('agent:signIn'),
    setApiKey: invoke('agent:setApiKey'),
    models: invoke('agent:models'),
    send: invoke('agent:send'),
    interrupt: invoke('agent:interrupt'),
    approve: invoke('agent:approve'),
    onEvent: (cb: (batch: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, batch: unknown) => cb(batch);
      ipcRenderer.on('agent:event', listener);
      return () => ipcRenderer.removeListener('agent:event', listener);
    },
  },
  settings: {
    get: invoke('settings:get'),
    set: invoke('settings:set'),
  },
};

const deepFreeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

contextBridge.exposeInMainWorld('api', deepFreeze(api));
