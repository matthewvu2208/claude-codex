import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/ipc';
import { exitCode, onTerminalData, onTerminalExit, terminalHistory } from '../../lib/terminals';

interface Tab {
  id: string;
  title: string;
}

/** xterm colors from the design tokens. */
function tokenTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: v('--bg-sidebar'),
    foreground: v('--text-primary'),
    cursor: v('--text-primary'),
    selectionBackground: v('--selection'),
    black: v('--bg-raised'),
    brightBlack: v('--text-muted'),
    red: v('--danger'),
    green: v('--context-fill'),
    yellow: v('--attention'),
    blue: v('--accent-codex'),
    magenta: v('--shiki-token-keyword'),
    cyan: v('--link'),
    white: v('--text-secondary'),
    brightWhite: v('--text-primary'),
  };
}

function TerminalView({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const term = new Terminal({
      fontFamily: css.getPropertyValue('--font-mono').trim(),
      fontSize: 13,
      cursorBlink: true,
      theme: tokenTheme(),
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    term.write(terminalHistory(id));
    const offData = onTerminalData(id, (d) => term.write(d));
    const sub = term.onData((d) => void api.pty.write({ id, data: d }));
    const resize = () => {
      try {
        fit.fit();
        void api.pty.resize({ id, cols: term.cols, rows: term.rows });
      } catch {
        // Not laid out yet.
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    term.focus();
    return () => {
      ro.disconnect();
      sub.dispose();
      offData();
      term.dispose();
    };
  }, [id]);

  return <div ref={host} className="min-h-0 flex-1 px-2 py-1.5" data-terminal-id={id} />;
}

/** Shells in the session folder (or worktree), one per tab. */
export function TerminalPanel({ sessionId }: { sessionId: string }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const create = useCallback(async () => {
    const t = await api.pty.create({ sessionId, cols: 80, rows: 24 });
    setTabs((list) => [...list, { id: t.id, title: t.title }]);
    setActive(t.id);
  }, [sessionId]);

  useEffect(() => {
    let live = true;
    void api.pty.list({ sessionId }).then((list) => {
      if (!live) return;
      if (list.length === 0) void create();
      else {
        setTabs(list.map((t) => ({ id: t.id, title: t.title })));
        setActive(list[list.length - 1]!.id);
      }
    });
    const off = onTerminalExit(() => setTick((n) => n + 1));
    return () => {
      live = false;
      off();
    };
  }, [sessionId, create]);

  const close = (id: string) => {
    void api.pty.kill({ id });
    setTabs((list) => {
      const next = list.filter((t) => t.id !== id);
      if (active === id) setActive(next.at(-1)?.id ?? null);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="Terminals"
        className="flex items-center gap-1 border-b border-border-subtle px-2 py-1"
      >
        {tabs.map((t, i) => (
          <div
            key={t.id}
            className={`flex items-center rounded-md ${t.id === active ? 'bg-raised' : ''}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={t.id === active}
              onClick={() => setActive(t.id)}
              className="h-7 px-2.5 text-[12px] text-label"
            >
              {t.title} {i + 1}
              {exitCode(t.id) !== undefined ? ' (exited)' : ''}
            </button>
            <button
              type="button"
              aria-label={`Close terminal ${i + 1}`}
              onClick={() => close(t.id)}
              className="flex size-6 items-center justify-center rounded text-muted hover:text-primary"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          aria-label="New terminal"
          onClick={() => void create()}
          className="flex size-7 items-center justify-center rounded-md text-secondary hover:bg-raised"
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
      {active ? <TerminalView key={active} id={active} /> : null}
    </div>
  );
}
