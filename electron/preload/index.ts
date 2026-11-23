import { contextBridge, ipcRenderer } from 'electron';
import type { Api, Platform } from '../../shared/api';
import type { IpcChannel } from '../../shared/ipc';

// The preload stays free of runtime dependencies (sandboxed preloads cannot require them);
// main validates every payload with the zod contract in shared/ipc.ts.
const invoke =
  (channel: IpcChannel) =>
  (input?: unknown): Promise<never> =>
    ipcRenderer.invoke(channel, input) as Promise<never>;

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
    events: invoke('sessions:events'),
    menu: invoke('sessions:menu'),
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
