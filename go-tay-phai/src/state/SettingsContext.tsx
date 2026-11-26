import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { loadSettings, sanitizeSettings, saveSettings, type Settings } from '../lib/storage';

type Action = { type: 'set'; patch: Partial<Settings> };

function reducer(state: Settings, action: Action): Settings {
  return sanitizeSettings({ ...state, ...action.patch });
}

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Ctx | null>(null);

function applyTheme(theme: Settings['theme']): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = (): void => {
    const dark = theme === 'dark' || (theme === 'system' && media.matches);
    document.documentElement.classList.toggle('dark', dark);
  };
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, dispatch] = useReducer(reducer, undefined, () => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  const update = (patch: Partial<Settings>): void => dispatch({ type: 'set', patch });
  return (
    <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
