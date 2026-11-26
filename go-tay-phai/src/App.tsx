import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { useStrings } from './i18n';
import { HistoryPage } from './pages/HistoryPage';
import { TestPage } from './pages/TestPage';
import { SettingsProvider } from './state/SettingsContext';

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `rounded-md px-3 py-2 text-base ${
          isActive ? 'bg-accent-soft text-text' : 'text-muted hover:bg-highlight hover:text-text'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function Layout() {
  const t = useStrings();
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-lg font-semibold text-text">{t.appName}</p>
            <p className="text-sm text-muted">{t.tagline}</p>
          </div>
          <nav aria-label={t.nav.main} className="flex gap-1">
            <NavItem to="/" label={t.nav.test} />
            <NavItem to="/lich-su" label={t.nav.history} />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<TestPage />} />
          <Route path="/lich-su" element={<HistoryPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <HashRouter>
        <Layout />
      </HashRouter>
    </SettingsProvider>
  );
}
