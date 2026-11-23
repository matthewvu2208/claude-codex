import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/sidebar/Sidebar';
import { SessionView } from './components/thread/SessionView';
import { TitleBar } from './components/titlebar/TitleBar';
import { Welcome } from './components/welcome/Welcome';
import { fixtureAccounts } from './fixtures/sidebar';
import { useApp } from './stores/app';

const plans = {
  claude: fixtureAccounts.find((a) => a.agent === 'claude')?.plan ?? null,
  codex: fixtureAccounts.find((a) => a.agent === 'codex')?.plan ?? null,
};

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const s = useApp();
  const { load } = s;

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="flex h-full flex-col">
      <TitleBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((o) => !o)} />
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
          />
        ) : null}
        {active ? (
          <SessionView key={active.id} session={active} />
        ) : (
          <Welcome
            plans={plans}
            agent={s.agent}
            onAgentChange={s.setAgent}
            folder={folder}
            onChooseFolder={(at) => void (s.folders.length ? s.chooseFolder(at) : s.openFolder())}
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
    </div>
  );
}
