import type { IpcChannel, IpcInput, IpcOutput } from './ipc';

export type Platform = 'darwin' | 'win32' | 'linux';

type Invoke<C extends IpcChannel> =
  IpcInput<C> extends undefined
    ? () => Promise<IpcOutput<C>>
    : (input: IpcInput<C>) => Promise<IpcOutput<C>>;

/**
 * The typed bridge exposed on `window.api` by the preload script. Each method maps to one
 * invoke channel in shared/ipc.ts, validated in main.
 */
export interface Api {
  readonly app: { readonly platform: Platform };
  readonly folders: {
    list: Invoke<'folders:list'>;
    choose: Invoke<'folders:choose'>;
    open: Invoke<'folders:open'>;
  };
  readonly sessions: {
    list: Invoke<'sessions:list'>;
    create: Invoke<'sessions:create'>;
    rename: Invoke<'sessions:rename'>;
    archive: Invoke<'sessions:archive'>;
    update: Invoke<'sessions:update'>;
    events: Invoke<'sessions:events'>;
    menu: Invoke<'sessions:menu'>;
  };
  readonly fs: {
    files: Invoke<'fs:files'>;
  };
  readonly agent: {
    commands: Invoke<'agent:commands'>;
    status: Invoke<'agent:status'>;
    signIn: Invoke<'agent:signIn'>;
    setApiKey: Invoke<'agent:setApiKey'>;
    models: Invoke<'agent:models'>;
    send: Invoke<'agent:send'>;
    interrupt: Invoke<'agent:interrupt'>;
    approve: Invoke<'agent:approve'>;
    /** Batches of events from main; validate with EventBatchSchema before use. */
    onEvent: (cb: (batch: unknown) => void) => () => void;
  };
  readonly settings: {
    get: Invoke<'settings:get'>;
    set: Invoke<'settings:set'>;
  };
}
