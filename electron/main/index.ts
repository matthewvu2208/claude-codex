import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, session, shell } from 'electron';
import { isAllowedNavigation } from '../../shared/security';

const here = fileURLToPath(new URL('.', import.meta.url));
const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

// Sandbox every renderer. `--no-sandbox` (only for root Linux CI containers) opts out.
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#1A1D24',
    title: 'Claude Codex',
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

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
