import type { Api } from '../../shared/api';

/** The only way the renderer talks to the main process. */
export const api: Api = window.api;
