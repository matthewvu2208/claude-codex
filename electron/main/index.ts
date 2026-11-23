import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, session, shell } from 'electron';
import { isAllowedNavigation } from '../../shared/security';
import { createHandlers } from './ipc/handlers';
import { registerIpc } from './ipc/router';
import { openDatabase } from './store/db';
import { createStore, type Store } from './store/repositories';
import { createRuntime, type Runtime } from './runtime';

const here = fileURLToPath(new URL('.', import.meta.url));
const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

/** Mirrors bg.sidebar, text.secondary and the title bar height in src/styles/tokens.css. */
const TITLE_BAR = { background: '#141518', symbol: '#9BA1AD', height: 52 } as const;

// Sandbox every renderer. `--no-sandbox` (only for root Linux CI containers) opts out.
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();

// Tests point the app at a throwaway data folder.
const userDataOverride = process.env['CLAUDE_CODEX_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

let mainWindow: BrowserWindow | null = null;
let store: Store | null = null;
let runtime: Runtime | null = null;
const appUrl = () => mainWindow?.webContents.getURL() ?? '';

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

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(here, '../renderer/index.html'));
  }
  return win;
}

app.on('web-contents-created', (_event, contents) => {
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
  // Deny every permission (camera, notifications, …) until a feature asks for one.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  store = createStore(openDatabase(join(app.getPath('userData'), 'app.db')));
  runtime = createRuntime(store, () => mainWindow);
  registerIpc(createHandlers(store, runtime.hub, runtime.accounts), appUrl);

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
  store?.db.close();
  store = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
