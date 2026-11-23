import { contextBridge } from 'electron';
import type { Api } from '../../shared/api';

const api: Api = Object.freeze({});

contextBridge.exposeInMainWorld('api', api);
