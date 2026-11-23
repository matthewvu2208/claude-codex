import { app, BrowserWindow, Notification } from 'electron';
import type { EventEnvelope } from '../../shared/events';
import { ClaudeAdapter, type QueryFn } from './agents/claude/ClaudeAdapter';
import { fakeQuery } from './agents/claude/fakeQuery';
import { AgentHub } from './agents/hub';
import { AccountsService } from './services/accounts';
import { SecretStore } from './services/secrets';
import type { Store } from './store/repositories';

export interface Runtime {
  hub: AgentHub;
  accounts: AccountsService;
  claude: ClaudeAdapter;
}

/** Wires adapters, the hub and accounts. `getWindow` is read lazily for events and notifications. */
export function createRuntime(store: Store, getWindow: () => BrowserWindow | null): Runtime {
  // Sessions left running by a previous run are idle now; their agents resume on the next send.
  store.db
    .prepare("UPDATE sessions SET status = 'idle' WHERE status IN ('running', 'waiting')")
    .run();

  const secrets = new SecretStore(store.settings);
  // End-to-end tests swap in a scripted agent; never available in packaged builds.
  const fake = !app.isPackaged && process.env['CLAUDE_CODEX_FAKE_AGENT'] === '1';

  let accounts: AccountsService | null = null;
  const claude = new ClaudeAdapter({
    ...(fake
      ? {
          queryFn: fakeQuery as QueryFn,
          authStatus: async () => ({ loggedIn: true, authMethod: 'fake' }),
          binaryPath: null,
        }
      : {}),
    env: () => accounts?.apiKeyEnv('claude', 'ANTHROPIC_API_KEY') ?? {},
  });

  const sink = (batch: EventEnvelope[]) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('agent:event', batch);
  };

  const hub = new AgentHub({
    store,
    adapters: { claude },
    sink,
    notify: (_session, title, body) => {
      const win = getWindow();
      if (!win || win.isFocused() || !Notification.isSupported()) return;
      const n = new Notification({ title, body, silent: false });
      n.on('click', () => {
        win.show();
        win.focus();
      });
      n.show();
    },
  });

  accounts = new AccountsService(hub, secrets, {
    claude: {
      command: () =>
        claude.binaryPath ? { command: claude.binaryPath, args: ['auth', 'login'] } : null,
    },
  });

  return { hub, accounts, claude };
}
