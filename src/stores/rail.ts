import { create } from 'zustand';

export const PANELS = ['outline', 'browser', 'files', 'git', 'terminal'] as const;
export type PanelId = (typeof PANELS)[number];

export const PANE_MIN = 280;
export const PANE_MAX = 900;

interface RailState {
  panel: PanelId | null;
  width: number;
  /** Terminal output arrived while the Terminal panel was closed. */
  unseenTerminal: boolean;
  toggle: (panel: PanelId) => void;
  setWidth: (width: number) => void;
  markTerminalOutput: () => void;
  /** Outline → thread: scroll to this item (nonce makes repeat clicks work). */
  scrollTarget: { index: number; nonce: number } | null;
  scrollTo: (index: number) => void;
}

export const useRail = create<RailState>((set, get) => ({
  panel: null,
  width: 420,
  unseenTerminal: false,
  toggle: (panel) =>
    set((s) => ({
      panel: s.panel === panel ? null : panel,
      unseenTerminal: panel === 'terminal' ? false : s.unseenTerminal,
    })),
  setWidth: (width) => set({ width: Math.min(PANE_MAX, Math.max(PANE_MIN, Math.round(width))) }),
  markTerminalOutput: () => {
    if (get().panel !== 'terminal') set({ unseenTerminal: true });
  },
  scrollTarget: null,
  scrollTo: (index) =>
    set((s) => ({ scrollTarget: { index, nonce: (s.scrollTarget?.nonce ?? 0) + 1 } })),
}));
