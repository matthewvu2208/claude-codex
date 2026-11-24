import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Notification, shell } from 'electron';
import type { EventEnvelope } from '../../shared/events';
import { ClaudeAdapter, type QueryFn } from './agents/claude/ClaudeAdapter';
import { fakeQuery } from './agents/claude/fakeQuery';
import { CodexAdapter } from './agents/codex/CodexAdapter';
import { findCodex, spawnAppServer } from './agents/codex/process';
import { AgentHub } from './agents/hub';
import { DEFAULT_CHILD_LIMIT, Orchestrator } from './agents/orchestrator';
import { isGitRepo } from './services/git';
import { simpleGit } from 'simple-git';
import { SettingsSchema } from '../../shared/ipc';
import { AccountsService } from './services/accounts';
import { API_KEY_SECRET } from './services/accounts';
import { SecretStore } from './services/secrets';
import { recoverInterruptedTurns, type Store } from './store/repositories';

export interface Runtime {
  hub: AgentHub;
  accounts: AccountsService;
  claude: ClaudeAdapter;
  codex: CodexAdapter;
  orchestrator: Orchestrator;
}

const here = fileURLToPath(new URL('.', import.meta.url));

/** Wires adapters, the hub and accounts. `getWindow` is read lazily for events and notifications. */
export function createRuntime(store: Store, getWindow: () => BrowserWindow | null): Runtime {
  recoverInterruptedTurns(store);

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

  const codex = new CodexAdapter({
    clientVersion: app.getVersion(),
    connect: () => {
      if (fake) {
        return spawnAppServer({
          command: process.execPath,
          args: [join(here, 'fake-codex.js')],
          env: { ELECTRON_RUN_AS_NODE: '1' },
        });
      }
      const bin = findCodex();
      return bin ? spawnAppServer({ command: bin, args: ['app-server'] }) : null;
    },
    openExternal: (url) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
    },
    apiKey: () => secrets.get(API_KEY_SECRET.codex),
  });

  const sink = (batch: EventEnvelope[]) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('agent:event', batch);
  };

  const hub = new AgentHub({
    store,
    adapters: { claude, codex },
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

  const orchestrator = new Orchestrator({
    store,
    hub,
    childLimit: () => {
      const v = store.settings.all()['subsessionLimit'];
      return typeof v === 'number' && v >= 1 && v <= 10 ? v : DEFAULT_CHILD_LIMIT;
    },
    defaults: (agent) => {
      const d = SettingsSchema.safeParse(store.settings.all()).data?.agentDefaults?.[agent];
      return { model: d?.model ?? (agent === 'claude' ? 'opus' : null), effort: d?.effort ?? null };
    },
    diffStat: async (cwd) => {
      if (!isGitRepo(cwd)) return null;
      try {
        return await simpleGit(cwd).diff(['--stat']);
      } catch {
        return null;
      }
    },
  });

  accounts = new AccountsService(hub, secrets, {
    claude: {
      command: () =>
        claude.binaryPath ? { command: claude.binaryPath, args: ['auth', 'login'] } : null,
    },
  });

  return { hub, accounts, claude, codex, orchestrator };
}
