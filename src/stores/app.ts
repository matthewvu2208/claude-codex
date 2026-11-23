import { create } from 'zustand';
import { AGENT_IDS, type AgentId, type Permission } from '../../shared/agents';
import type { AccountStatus, ModelInfo } from '../../shared/events';
import type { Folder, Session, SessionStatus } from '../../shared/models';
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
  accountsOpen: boolean;

  load: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  loadModels: (agent: AgentId) => Promise<void>;
  setAccountsOpen: (open: boolean) => void;
  setStatus: (id: string, status: SessionStatus) => void;
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
  accountsOpen: false,

  refreshAccounts: async () => {
    const results = await Promise.all(
      AGENT_IDS.map((agent) => api.agent.status({ agent }).catch(() => null)),
    );
    const accounts: Partial<Record<AgentId, AccountStatus>> = {};
    for (const r of results) if (r) accounts[r.agent] = r;
    set({ accounts });
  },

  loadModels: async (agent) => {
    if (get().models[agent]) return;
    try {
      const list = await api.agent.models({ agent });
      set((s) => ({ models: { ...s.models, [agent]: list } }));
    } catch {
      // Not signed in or not available yet; labels fall back to the stored model value.
    }
  },

  setAccountsOpen: (accountsOpen) => set({ accountsOpen }),

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
    set({ loaded: true, folders, sessions, folderId, agent: settings.lastAgent ?? 'claude' });
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
  },
}));
