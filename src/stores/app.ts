import { create } from 'zustand';
import { AGENT_IDS, type AgentId, type Permission } from '../../shared/agents';
import type { AccountStatus, ModelInfo } from '../../shared/events';
import type { AgentSettings } from '../components/common/AgentControls';
import type { SettingsTab } from '../components/settings/SettingsDialog';
import type { Folder, Session, SessionStatus } from '../../shared/models';
import { UsageStateSchema, type UsageState } from '../../shared/usage';
import { api } from '../lib/ipc';

interface AppState {
  loaded: boolean;
  folders: Folder[];
  sessions: Session[];
  activeId: string | null;
  /** The folder the Welcome screen starts sessions in. */
  folderId: string | null;
  agent: AgentId;
  renamingId: string | null;
  lastSessionId: string | null;
  accounts: Partial<Record<AgentId, AccountStatus>>;
  models: Partial<Record<AgentId, ModelInfo[]>>;
  /** The open Settings tab, or null when Settings is closed. */
  settingsTab: SettingsTab | null;
  /** Model, effort and permission the Welcome screen starts each agent with. */
  welcome: Record<AgentId, AgentSettings>;
  usage: UsageState;
  loadUsage: (refresh: boolean) => Promise<void>;
  setUsage: (raw: unknown) => void;

  load: () => Promise<void>;
  setWelcomeSettings: (agent: AgentId, patch: Partial<AgentSettings>) => void;
  updateSession: (id: string, patch: Partial<AgentSettings>) => Promise<void>;
  refreshAccounts: () => Promise<void>;
  loadModels: (agent: AgentId) => Promise<void>;
  openSettings: (tab: SettingsTab | null) => void;
  setStatus: (id: string, status: SessionStatus) => void;
  reloadSessions: () => Promise<void>;
  goBack: () => void;
  open: (id: string | null) => void;
  setAgent: (agent: AgentId) => void;
  chooseFolder: (at?: { x: number; y: number }) => Promise<void>;
  openFolder: () => Promise<void>;
  createSession: (o: {
    prompt: string;
    model: string | null;
    effort: string | null;
    permission: Permission;
    worktree: boolean;
  }) => Promise<Session | null>;
  rename: (id: string, title: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  setRenaming: (id: string | null) => void;
  sessionMenu: (id: string, at?: { x: number; y: number }) => Promise<void>;
}

/** Design defaults (artboard 1): Opus 5.5, Low, Ask. Codex starts on its default model. */
export const WELCOME_DEFAULTS: Record<AgentId, AgentSettings> = {
  claude: { model: 'opus', effort: 'low', permission: 'ask' },
  codex: { model: null, effort: null, permission: 'ask' },
};

const upsertFolder = (folders: Folder[], f: Folder) =>
  [f, ...folders.filter((x) => x.id !== f.id)].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  folders: [],
  sessions: [],
  activeId: null,
  folderId: null,
  agent: 'claude',
  renamingId: null,
  lastSessionId: null,
  accounts: {},
  models: {},
  settingsTab: null,
  welcome: WELCOME_DEFAULTS,
  usage: { claude: null, codex: null },
  loadUsage: async (refresh) => {
    try {
      set({ usage: await api.usage.read({ refresh }) });
    } catch {
      // Unknown usage shows as "—".
    }
  },
  setUsage: (raw) => {
    const parsed = UsageStateSchema.safeParse(raw);
    if (parsed.success) set({ usage: parsed.data });
  },

  setWelcomeSettings: (agent, patch) => {
    const welcome = { ...get().welcome, [agent]: { ...get().welcome[agent], ...patch } };
    set({ welcome });
    const agentDefaults = Object.fromEntries(
      AGENT_IDS.map((a) => {
        const w = welcome[a];
        return [
          a,
          {
            ...(w.model ? { model: w.model } : {}),
            ...(w.effort ? { effort: w.effort } : {}),
            permission: w.permission,
          },
        ];
      }),
    );
    void api.settings.set({ agentDefaults });
  },

  updateSession: async (id, patch) => {
    const clean = {
      ...(patch.model ? { model: patch.model } : {}),
      ...(patch.effort ? { effort: patch.effort } : {}),
      ...(patch.permission ? { permission: patch.permission } : {}),
    };
    // Show the choice at once; the stored session comes back from main.
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...clean } : x)) }));
    const updated = await api.sessions.update({ id, ...clean });
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? updated : x)) }));
  },

  refreshAccounts: async () => {
    const results = await Promise.all(
      AGENT_IDS.map((agent) => api.agent.status({ agent }).catch(() => null)),
    );
    const accounts: Partial<Record<AgentId, AccountStatus>> = {};
    for (const r of results) if (r) accounts[r.agent] = r;
    set({ accounts });
  },

  loadModels: async (agent) => {
    if (get().models[agent]?.length) return;
    try {
      const list = await api.agent.models({ agent });
      set((s) => ({ models: { ...s.models, [agent]: list } }));
    } catch {
      // Not signed in or not available yet; labels fall back to the stored model value.
    }
  },

  openSettings: (settingsTab) => set({ settingsTab }),

  reloadSessions: async () => set({ sessions: await api.sessions.list() }),

  setStatus: (id, status) =>
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, status } : x)) })),

  goBack: () => {
    const { activeId, lastSessionId, sessions } = get();
    if (activeId) set({ activeId: null, lastSessionId: activeId });
    else if (lastSessionId && sessions.some((x) => x.id === lastSessionId))
      set({ activeId: lastSessionId });
  },

  load: async () => {
    const [folders, sessions, settings] = await Promise.all([
      api.folders.list(),
      api.sessions.list(),
      api.settings.get(),
    ]);
    const folderId =
      folders.find((f) => f.id === settings.lastFolderId)?.id ?? folders[0]?.id ?? null;
    const welcome = { ...WELCOME_DEFAULTS };
    for (const a of AGENT_IDS) {
      const d = settings.agentDefaults?.[a];
      if (d) {
        welcome[a] = {
          model: d.model ?? welcome[a].model,
          effort: d.effort ?? welcome[a].effort,
          permission: d.permission ?? welcome[a].permission,
        };
      }
    }
    set({
      loaded: true,
      folders,
      sessions,
      folderId,
      agent: settings.lastAgent ?? 'claude',
      welcome,
    });
  },

  open: (id) => set((s) => ({ activeId: id, lastSessionId: s.activeId ?? s.lastSessionId })),

  setAgent: (agent) => {
    set({ agent });
    void api.settings.set({ lastAgent: agent });
  },

  chooseFolder: async (at) => {
    const folder = await api.folders.choose(at ? { at } : {});
    if (!folder) return;
    set({ folders: upsertFolder(get().folders, folder), folderId: folder.id });
    void api.settings.set({ lastFolderId: folder.id });
  },

  openFolder: async () => {
    const folder = await api.folders.open();
    if (!folder) return;
    set({ folders: upsertFolder(get().folders, folder), folderId: folder.id });
    void api.settings.set({ lastFolderId: folder.id });
  },

  createSession: async (o) => {
    const { folderId, agent } = get();
    if (!folderId) return null;
    const session = await api.sessions.create({ folderId, agent, ...o });
    set((s) => ({ sessions: [session, ...s.sessions], activeId: session.id }));
    // Errors (e.g. not signed in) arrive as thread events.
    void api.agent.send({ sessionId: session.id, text: o.prompt }).catch(() => undefined);
    return session;
  },

  rename: async (id, title) => {
    const trimmed = title.trim();
    set({ renamingId: null });
    if (!trimmed) return;
    const updated = await api.sessions.rename({ id, title: trimmed });
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? updated : x)) }));
  },

  archive: async (id) => {
    await api.sessions.archive({ id });
    // Archiving hides the session and its sub-sessions.
    const sessions = await api.sessions.list();
    set((s) => ({
      sessions,
      activeId: sessions.some((x) => x.id === s.activeId) ? s.activeId : null,
    }));
  },

  setRenaming: (id) => set({ renamingId: id }),

  sessionMenu: async (id, at) => {
    const action = await api.sessions.menu(at ? { id, at } : { id });
    if (action === 'rename') set({ renamingId: id });
    if (action === 'archive') await get().archive(id);
    if (action === 'remove-worktree') set({ sessions: await api.sessions.list() });
  },
}));
