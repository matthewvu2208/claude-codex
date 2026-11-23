import { contextBridge } from 'electron';
import type { Api, Platform } from '../../shared/api';

const platform: Platform =
  process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux';

const api: Api = Object.freeze({
  app: Object.freeze({ platform }),
});

contextBridge.exposeInMainWorld('api', api);
