import { useEffect, useMemo, useState } from 'react';
import { AGENT_IDS, type AgentId } from '../shared/agents';
import { EventBatchSchema } from '../shared/events';
import { AccountsDialog } from './components/settings/AccountsDialog';
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
import { useRail } from './stores/rail';

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
            onOpenSettings={() => s.setAccountsOpen(true)}
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
            onStart={(o) =>
              void s.createSession({
                prompt: o.text,
                model: o.model,
                effort: o.effort,
                permission: o.permission,
                worktree: o.worktree,
              })
            }
          />
        )}
      </div>
      {s.accountsOpen ? (
        <AccountsDialog
          accounts={s.accounts}
          onClose={() => s.setAccountsOpen(false)}
          onChanged={() => void refreshAccounts()}
        />
      ) : null}
    </div>
  );
}
