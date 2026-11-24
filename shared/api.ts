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
  readonly app: {
    readonly platform: Platform;
    info: Invoke<'app:info'>;
    openLogs: Invoke<'app:openLogs'>;
  };
  readonly attachments: {
    pick: Invoke<'attachments:pick'>;
    addPaths: Invoke<'attachments:addPaths'>;
    addData: Invoke<'attachments:addData'>;
    preview: Invoke<'attachments:preview'>;
    /** The path of a dropped file (Electron's webUtils), or '' when it has none. */
    pathFor: (file: File) => string;
  };
  readonly folders: {
    list: Invoke<'folders:list'>;
    choose: Invoke<'folders:choose'>;
    open: Invoke<'folders:open'>;
    chats: Invoke<'folders:chats'>;
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
    tree: Invoke<'fs:tree'>;
    read: Invoke<'fs:read'>;
    open: Invoke<'fs:open'>;
  };
  readonly git: {
    status: Invoke<'git:status'>;
    diff: Invoke<'git:diff'>;
    stage: Invoke<'git:stage'>;
    unstage: Invoke<'git:unstage'>;
    commit: Invoke<'git:commit'>;
  };
  readonly pty: {
    create: Invoke<'pty:create'>;
    list: Invoke<'pty:list'>;
    write: Invoke<'pty:write'>;
    resize: Invoke<'pty:resize'>;
    kill: Invoke<'pty:kill'>;
    /** Terminal output batches and exits; validate before use. */
    onData: (cb: (batch: unknown) => void) => () => void;
    onExit: (cb: (info: unknown) => void) => () => void;
  };
  readonly browser: {
    show: Invoke<'browser:show'>;
    hide: Invoke<'browser:hide'>;
    navigate: Invoke<'browser:navigate'>;
    action: Invoke<'browser:action'>;
    devServers: Invoke<'browser:devServers'>;
    onState: (cb: (state: unknown) => void) => () => void;
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
  readonly usage: {
    read: Invoke<'usage:read'>;
    /** Pushed when usage changes; validate with UsageStateSchema. */
    onChange: (cb: (state: unknown) => void) => () => void;
  };
  readonly settings: {
    get: Invoke<'settings:get'>;
    set: Invoke<'settings:set'>;
    chooseWorktreeRoot: Invoke<'settings:chooseWorktreeRoot'>;
  };
}
