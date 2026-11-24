import { connect } from 'node:net';
import { BrowserWindow, session, WebContentsView, type WebContents } from 'electron';

/** The panel's web contents; the app-wide navigation guard leaves these alone. */
export const browserContents = new WeakSet<WebContents>();

export interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEV_PORTS = [3000, 3001, 4173, 4200, 4321, 5000, 5173, 5174, 8000, 8080, 8081, 8888];

/** Local dev servers that answer on common ports, as http://localhost:<port>. */
export async function detectDevServers(ports = DEV_PORTS): Promise<string[]> {
  const open = await Promise.all(
    ports.map(
      (port) =>
        new Promise<number | null>((resolve) => {
          const socket = connect({ host: '127.0.0.1', port });
          const done = (ok: boolean) => {
            socket.destroy();
            resolve(ok ? port : null);
          };
          socket.setTimeout(300, () => done(false));
          socket.once('connect', () => done(true));
          socket.once('error', () => done(false));
        }),
    ),
  );
  return open.filter((p): p is number => p !== null).map((p) => `http://localhost:${p}`);
}

/** Only web pages: http(s) URLs, with "localhost:5173" or "example.com" completed. */
export function normalizeUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  // "localhost:5173" parses as scheme "localhost:", so hosts are recognized before schemes.
  const withScheme = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(t)
    ? `http://${t}`
    : /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(javascript|data|file|about|mailto):/i.test(t)
      ? t
      : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The Browser panel: a sandboxed WebContentsView in its own session, placed over the panel's
 * area of the window. It never gets the app's preload or IPC.
 */
export class BrowserPanel {
  private view: WebContentsView | null = null;

  constructor(
    private readonly window: () => BrowserWindow | null,
    private readonly onState: (s: BrowserState) => void,
  ) {}

  private ensure(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view;
    const partition = 'persist:browser-panel';
    const ses = session.fromPartition(partition);
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    const view = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    const wc = view.webContents;
    browserContents.add(wc);
    const emit = () => {
      if (wc.isDestroyed()) return;
      this.onState({
        url: wc.getURL(),
        title: wc.getTitle(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        loading: wc.isLoading(),
      });
    };
    for (const e of [
      'did-navigate',
      'did-navigate-in-page',
      'page-title-updated',
      'did-start-loading',
      'did-stop-loading',
    ] as const) {
      wc.on(e as 'did-stop-loading', emit);
    }
    wc.on('did-fail-load', emit);
    // Links that open new windows load in the panel instead (web pages only).
    wc.setWindowOpenHandler(({ url }) => {
      const next = normalizeUrl(url);
      if (next) void wc.loadURL(next);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (event, url) => {
      if (!normalizeUrl(url)) event.preventDefault();
    });
    this.view = view;
    return view;
  }

  show(bounds: Bounds, url?: string): void {
    const win = this.window();
    if (!win) return;
    const view = this.ensure();
    if (!win.contentView.children.includes(view)) win.contentView.addChildView(view);
    view.setBounds(roundBounds(bounds));
    view.setVisible(true);
    if (url) this.navigate(url);
  }

  hide(): void {
    this.view?.setVisible(false);
  }

  navigate(input: string): string | null {
    const url = normalizeUrl(input);
    if (!url) return null;
    void this.ensure()
      .webContents.loadURL(url)
      .catch(() => undefined);
    return url;
  }

  action(a: 'back' | 'forward' | 'reload'): void {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    if (a === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (a === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    if (a === 'reload') wc.reload();
  }

  /** For tests and the panel's empty state. */
  currentUrl(): string | null {
    const wc = this.view?.webContents;
    return wc && !wc.isDestroyed() ? wc.getURL() : null;
  }
}

const roundBounds = (b: Bounds) => ({
  x: Math.round(b.x),
  y: Math.round(b.y),
  width: Math.max(0, Math.round(b.width)),
  height: Math.max(0, Math.round(b.height)),
});
