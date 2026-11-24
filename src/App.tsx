import { useEffect, useMemo, useState } from 'react';
import { AGENT_IDS, type AgentId } from '../shared/agents';
import { EventBatchSchema } from '../shared/events';
import { CommandPalette, type Command } from './components/common/CommandPalette';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { Sidebar } from './components/sidebar/Sidebar';
import { SessionView } from './components/thread/SessionView';
import { SessionMeters, SessionTitle } from './components/titlebar/SessionHeader';
import { TitleBar } from './components/titlebar/TitleBar';
import { DEFAULT_MODEL, Welcome } from './components/welcome/Welcome';
import { api } from './lib/ipc';
import { buildThread } from './lib/thread';
import { useApp } from './stores/app';
import { useThreads } from './stores/threads';
import { Rail } from './components/rail/Rail';
import { RightPane } from './components/rail/RightPane';
import { OutlinePanel } from './components/rail/OutlinePanel';
import { FilesPanel } from './components/rail/FilesPanel';
import { GitPanel } from './components/rail/GitPanel';
import { TerminalPanel } from './components/rail/TerminalPanel';
import { BrowserPanel } from './components/rail/BrowserPanel';
import { startTerminalRouter } from './lib/terminals';
import { PANELS, useRail } from './stores/rail';
import { isModKey } from './lib/shortcuts';
import { shortcut } from './lib/platform';

const PANEL_TITLES = {
  outline: 'Outline',
  browser: 'Browser',
  files: 'Files',
  git: 'Git',
  terminal: 'Terminal',
} as const;

/** Main → renderer events: validate, then route to the thread log and session status. */
function useAgentEvents() {
  useEffect(
    () =>
      api.agent.onEvent((raw) => {
        const parsed = EventBatchSchema.safeParse(raw);
        if (!parsed.success) return;
        useThreads.getState().ingest(parsed.data);
        for (const { e } of parsed.data) {
          if (e.t === 'session.status') useApp.getState().setStatus(e.sessionId, e.status);
          // A new sub-session appears in the sidebar under its parent.
          if (e.t === 'subsession.started') void useApp.getState().reloadSessions();
        }
      }),
    [],
  );
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const panel = useRail((r) => r.panel);
  useEffect(() => startTerminalRouter(() => useRail.getState().markTerminalOutput()), []);
  useEffect(() => {
    void useApp.getState().loadUsage(false);
    return api.usage.onChange((raw) => useApp.getState().setUsage(raw));
  }, []);
  const s = useApp();
  const { load, refreshAccounts, loadModels } = s;
  useAgentEvents();

  useEffect(() => {
    void load();
    void refreshAccounts();
    // Sign-in finishes in another app; check again when the window comes back.
    const onFocus = () => void refreshAccounts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load, refreshAccounts]);

  const tree = useMemo(
    () =>
      s.folders.map((f) => ({
        id: f.id,
        name: f.name,
        sessions: s.sessions.filter((x) => x.folderId === f.id),
      })),
    [s.folders, s.sessions],
  );
  const active = s.sessions.find((x) => x.id === s.activeId) ?? null;
  const folder = s.folders.find((f) => f.id === s.folderId) ?? null;

  const loadThread = useThreads((t) => t.load);
  const log = useThreads((t) => (active ? t.logs[active.id] : undefined));
  useEffect(() => {
    if (active) {
      void loadThread(active.id);
      void loadModels(active.agent);
    }
  }, [active, loadThread, loadModels]);
  const thread = useMemo(
    () =>
      buildThread(
        (log?.envelopes ?? []).map((env) => env.e),
        (log?.envelopes ?? []).map((env) => env.ts),
      ),
    [log],
  );

  const plans = Object.fromEntries(
    AGENT_IDS.map((agent) => {
      const a = s.accounts[agent];
      return [agent, a?.signedIn ? (a.plan ?? a.method ?? 'Signed in') : null];
    }),
  ) as Record<AgentId, string | null>;

  // Load the model list for the agent on screen (Welcome or the open session).
  const shownAgent = active?.agent ?? s.agent;
  useEffect(() => {
    void loadModels(shownAgent);
  }, [shownAgent, loadModels, s.accounts]);

  // Commands (⌘K) and the global shortcuts.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toggle = useRail((r) => r.toggle);
  const commands: Command[] = [
    { id: 'new', label: 'New session', keys: shortcut('N'), run: () => s.open(null) },
    { id: 'folder', label: 'Open folder…', run: () => void s.openFolder() },
    {
      id: 'settings',
      label: 'Settings',
      keys: shortcut(','),
      run: () => s.openSettings('general'),
    },
    { id: 'accounts', label: 'Accounts', run: () => s.openSettings('accounts') },
    { id: 'shortcuts', label: 'Keyboard shortcuts', run: () => s.openSettings('shortcuts') },
    {
      id: 'sidebar',
      label: sidebarOpen ? 'Hide sidebar' : 'Show sidebar',
      run: () => setSidebarOpen((o) => !o),
    },
    ...(active
      ? [
          ...PANELS.map((p) => ({
            id: `panel-${p}`,
            label: `${panel === p ? 'Hide' : 'Show'} ${PANEL_TITLES[p]}`,
            run: () => toggle(p),
          })),
          ...(thread.running
            ? [
                {
                  id: 'stop',
                  label: 'Stop the agent',
                  keys: 'Esc',
                  run: () => void api.agent.interrupt({ sessionId: active.id }),
                },
              ]
            : []),
          {
            id: 'rename',
            label: 'Rename session',
            run: () => s.setRenaming(active.id),
          },
        ]
      : []),
  ];
  const { open: openSession, openSettings } = s;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isModKey(e, 'k')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (isModKey(e, 'n')) {
        e.preventDefault();
        openSession(null);
      } else if (isModKey(e, ',')) {
        e.preventDefault();
        openSettings('general');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSession, openSettings]);

  return (
    <div className="flex h-full flex-col">
      <TitleBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onBack={s.goBack}
        canGoBack
        center={
          active ? (
            <SessionTitle
              key={active.id}
              session={active}
              onRename={(title) => void s.rename(active.id, title)}
              onMenu={(at) => void s.sessionMenu(active.id, at)}
            />
          ) : undefined
        }
        meters={active ? <SessionMeters usage={thread.usage} /> : undefined}
        onCommands={() => setPaletteOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? (
          <Sidebar
            folders={tree}
            activeId={s.activeId}
            renamingId={s.renamingId}
            onOpen={s.open}
            onNewSession={() => s.open(null)}
            onMenu={(id, at) => void s.sessionMenu(id, at)}
            onRename={(id, title) => void s.rename(id, title)}
            onSetRenaming={s.setRenaming}
            accounts={s.accounts}
            onOpenSettings={() => s.openSettings('accounts')}
            usage={s.usage}
          />
        ) : null}
        {active ? (
          <>
            <SessionView
              key={active.id}
              session={active}
              thread={thread}
              models={s.models[active.agent]}
              fallbackModelLabel={
                active.model === DEFAULT_MODEL[active.agent].value || !active.model
                  ? DEFAULT_MODEL[active.agent].label
                  : active.model
              }
              onSettingsChange={(patch) => void s.updateSession(active.id, patch)}
              resolveSession={(id) => s.sessions.find((x) => x.id === id)}
              onOpenSession={s.open}
              account={s.accounts[active.agent]}
              onRecheckAccount={() => void refreshAccounts()}
              onOpenAccounts={() => s.openSettings('accounts')}
            />
            {panel ? (
              <RightPane title={PANEL_TITLES[panel]}>
                {panel === 'outline' ? <OutlinePanel items={thread.items} /> : null}
                {panel === 'browser' ? <BrowserPanel /> : null}
                {panel === 'files' ? <FilesPanel key={active.id} sessionId={active.id} /> : null}
                {panel === 'git' ? (
                  <GitPanel key={active.id} sessionId={active.id} refreshKey={active.status} />
                ) : null}
                {panel === 'terminal' ? (
                  <TerminalPanel key={active.id} sessionId={active.id} />
                ) : null}
              </RightPane>
            ) : null}
            <Rail />
          </>
        ) : (
          <Welcome
            plans={plans}
            agent={s.agent}
            onAgentChange={s.setAgent}
            folder={folder}
            onChooseFolder={(at) => void (s.folders.length ? s.chooseFolder(at) : s.openFolder())}
            models={s.models[s.agent]}
            settings={s.welcome[s.agent]}
            onSettingsChange={(patch) => s.setWelcomeSettings(s.agent, patch)}
            account={s.accounts[s.agent]}
            onRecheckAccount={() => void refreshAccounts()}
            onOpenAccounts={() => s.openSettings('accounts')}
            onStart={(o) =>
              void s.createSession({
                prompt: o.text,
                model: o.model,
                effort: o.effort,
                permission: o.permission,
                worktree: o.worktree,
                attachments: o.attachments,
              })
            }
          />
        )}
      </div>
      {s.settingsTab ? (
        <SettingsDialog
          tab={s.settingsTab}
          onTab={s.openSettings}
          accounts={s.accounts}
          onAccountsChanged={() => void refreshAccounts()}
          defaultAgent={s.agent}
          onDefaultAgent={s.setAgent}
          defaults={s.welcome}
          onDefaults={s.setWelcomeSettings}
          models={s.models}
          onClose={() => s.openSettings(null)}
        />
      ) : null}
      {paletteOpen ? (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      ) : null}
    </div>
  );
}
