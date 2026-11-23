import { useState } from 'react';
import { Sidebar } from './components/sidebar/Sidebar';
import { TitleBar } from './components/titlebar/TitleBar';
import { Welcome } from './components/welcome/Welcome';
import { fixtureAccounts, fixtureFolders } from './fixtures/sidebar';

const plans = {
  claude: fixtureAccounts.find((a) => a.agent === 'claude')?.plan ?? null,
  codex: fixtureAccounts.find((a) => a.agent === 'codex')?.plan ?? null,
};

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <TitleBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((o) => !o)} />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? (
          <Sidebar
            folders={fixtureFolders}
            activeId={activeId}
            onOpen={setActiveId}
            onNewSession={() => setActiveId(null)}
          />
        ) : null}
        <Welcome plans={plans} folderName="session_test" onStart={() => undefined} />
      </div>
    </div>
  );
}
