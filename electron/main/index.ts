import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, session, shell } from 'electron';
import { isAllowedNavigation } from '../../shared/security';
import { createHandlers } from './ipc/handlers';
import { registerIpc } from './ipc/router';
import { openDatabase } from './store/db';
import { createStore, type Store } from './store/repositories';
import { createRuntime, type Runtime } from './runtime';
import { BrowserPanel, browserContents } from './services/browser';
import { PtyManager } from './services/pty';
import { UsageService } from './services/usage';
import { initLog, log } from './services/log';
import { SettingsSchema, TEXT_SIZES, type Settings } from '../../shared/ipc';

const here = fileURLToPath(new URL('.', import.meta.url));
const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

/** Mirrors bg.sidebar, text.secondary and the title bar height in src/styles/tokens.css. */
const TITLE_BAR = { background: '#141518', symbol: '#9BA1AD', height: 52 } as const;

// Sandbox every renderer. `--no-sandbox` (only for root Linux CI containers) opts out.
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();

// Tests point the app at a throwaway data folder.
const userDataOverride = process.env['CLAUDE_CODEX_USER_DATA'];
if (userDataOverride) {
  app.setPath('userData', userDataOverride);
  app.setAppLogsPath(join(userDataOverride, 'logs'));
}

process.on('uncaughtException', (e) => log.error('Uncaught exception', e));
process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e));

let mainWindow: BrowserWindow | null = null;
let store: Store | null = null;
let runtime: Runtime | null = null;
let ptys: PtyManager | null = null;
let usage: UsageService | null = null;
const appUrl = () => mainWindow?.webContents.getURL() ?? '';

/** Text size from Settings, applied as the window's zoom. */
function applyTextSize(win: BrowserWindow | null, settings?: Settings) {
  if (!win || win.isDestroyed() || !store) return;
  const s = settings ?? SettingsSchema.parse(store.settings.all());
  win.webContents.setZoomFactor(TEXT_SIZES[s.textSize ?? 'default']);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: TITLE_BAR.background,
    title: 'Claude Codex',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 20 } }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: TITLE_BAR.background,
            symbolColor: TITLE_BAR.symbol,
            height: TITLE_BAR.height,
          },
        }),
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => applyTextSize(win));
  win.webContents.on('render-process-gone', (_e, d) =>
    log.error('Window renderer gone', { reason: d.reason, exitCode: d.exitCode }),
  );

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(here, '../renderer/index.html'));
  }
  return win;
}

app.on('web-contents-created', (_event, contents) => {
  // The Browser panel shows web pages by design; its own guards live in services/browser.ts.
  if (browserContents.has(contents)) return;
  // No remote content in app windows: block navigation, new windows and <webview>.
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, contents.getURL())) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
});

void app.whenReady().then(() => {
  initLog(app.getPath('logs'), !app.isPackaged && !process.env['CI']);
  log.info('App start', {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  });
  app.on('child-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit')
      log.warn('Child process gone', { type: d.type, reason: d.reason, exitCode: d.exitCode });
  });
  // Deny every permission (camera, notifications, …) until a feature asks for one.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  store = createStore(openDatabase(join(app.getPath('userData'), 'app.db')));
  runtime = createRuntime(store, () => mainWindow);
  const send = (channel: string, payload: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };
  ptys = new PtyManager(
    (batch) => send('pty:data', batch),
    (id, code) => send('pty:exit', { id, code }),
  );
  const browser = new BrowserPanel(
    () => mainWindow,
    (state) => send('browser:state', state),
  );
  usage = new UsageService({
    adapters: { claude: runtime.claude, codex: runtime.codex },
    settings: store.settings,
    push: (state) => send('usage:changed', state),
    // Opt-in M9 spike: raw rate-limit payloads, one JSON object per line.
    spikeLog:
      process.env['CLAUDE_CODEX_LOG_USAGE'] === '1'
        ? join(app.getPath('userData'), 'usage-spike.jsonl')
        : null,
  });
  usage.start();
  registerIpc(
    createHandlers(store, runtime.hub, runtime.accounts, {
      usage,
      pty: ptys,
      browser,
      worktreeRoot: () => join(app.getPath('userData'), 'worktrees'),
      appInfo: () => ({ version: app.getVersion(), logsPath: app.getPath('logs') }),
      onSettingsChanged: (s) => applyTextSize(mainWindow, s),
      runningChildren: (id) => runtime?.orchestrator.runningChildren(id) ?? [],
    }),
    appUrl,
  );

  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

let shuttingDown = false;
app.on('before-quit', (event) => {
  if (shuttingDown || !runtime) return;
  // Close agent processes cleanly before the database goes away.
  event.preventDefault();
  shuttingDown = true;
  void runtime.hub
    .shutdown()
    .catch(() => undefined)
    .finally(() => app.quit());
});

app.on('will-quit', () => {
  ptys?.killAll();
  usage?.stop();
  store?.db.close();
  store = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
