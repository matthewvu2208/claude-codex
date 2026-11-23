import { Contrast, Plus, Search, Settings } from 'lucide-react';
import { useState } from 'react';
import { AGENT_IDS, AGENT_LABELS, type AgentId } from '../../../shared/agents';
import type { AccountStatus } from '../../../shared/events';
import { fixtureUsage } from '../../fixtures/sidebar';
import { shortcut } from '../../lib/platform';
import { AgentIcon } from '../common/AgentIcon';
import { Kbd } from '../common/Kbd';
import { SessionTree, type TreeFolder } from './SessionTree';
import { UsageCard } from './UsageCard';

interface SidebarProps {
  folders: TreeFolder[];
  activeId: string | null;
  renamingId?: string | null;
  onOpen: (id: string) => void;
  onNewSession: () => void;
  onMenu?: (id: string, at: { x: number; y: number }) => void;
  onRename?: (id: string, title: string) => void;
  onSetRenaming?: (id: string | null) => void;
  accounts?: Partial<Record<AgentId, AccountStatus>>;
  onOpenSettings?: () => void;
}

const footerButton =
  'flex size-9 items-center justify-center rounded-lg text-label hover:bg-raised';

export function Sidebar({
  folders,
  activeId,
  renamingId,
  onOpen,
  onNewSession,
  onMenu,
  onRename,
  onSetRenaming,
  accounts = {},
  onOpenSettings,
}: SidebarProps) {
  const signedIn = AGENT_IDS.flatMap((agent) => {
    const a = accounts[agent];
    return a?.signedIn
      ? [{ agent, initial: a.initial ?? AGENT_LABELS[agent][0]!, plan: a.plan ?? a.method ?? '' }]
      : [];
  });
  const [filter, setFilter] = useState('');
  return (
    <nav
      aria-label="Sidebar"
      className="flex w-[var(--sidebar-width)] flex-none flex-col gap-3 border-r border-border-subtle bg-sidebar px-3 py-3.5"
    >
      <button
        type="button"
        onClick={onNewSession}
        className="flex h-[38px] flex-none items-center gap-2.5 rounded-[10px] border border-border bg-control px-3 text-primary hover:bg-raised"
      >
        <Plus size={16} strokeWidth={2} aria-hidden />
        <span className="flex-1 text-left">New session</span>
        <Kbd>{shortcut('N')}</Kbd>
      </button>
      <label className="flex h-9 flex-none items-center gap-2 rounded-[10px] border border-border-subtle bg-input px-2.5 text-muted focus-within:border-border">
        <Search size={15} strokeWidth={1.8} aria-hidden />
        <input
          type="search"
          aria-label="Search sessions"
          placeholder="Search sessions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-primary outline-none"
        />
      </label>

      {folders.length === 0 ? (
        <p className="flex-1 px-2 text-[13px] text-muted">No sessions yet</p>
      ) : (
        <SessionTree
          folders={folders}
          activeId={activeId}
          filter={filter}
          renamingId={renamingId ?? null}
          onOpen={onOpen}
          {...(onMenu ? { onMenu } : {})}
          {...(onRename ? { onRename } : {})}
          {...(onSetRenaming
            ? {
                onCancelRename: () => onSetRenaming(null),
                onStartRename: (id: string) => onSetRenaming(id),
              }
            : {})}
        />
      )}

      <UsageCard usage={fixtureUsage} />

      <div className="flex flex-none items-center gap-2 px-1">
        {signedIn.map((a) => (
          <span
            key={a.agent}
            role="img"
            aria-label={`${AGENT_LABELS[a.agent]} account${a.plan ? ` · ${a.plan}` : ''}`}
            title={`${AGENT_LABELS[a.agent]}${a.plan ? ` · ${a.plan}` : ''}`}
            className="relative flex size-8 items-center justify-center rounded-full bg-border font-semibold"
          >
            {a.initial}
            <span className="absolute -right-[3px] -bottom-[3px] flex size-3.5 items-center justify-center rounded-full bg-sidebar">
              <AgentIcon agent={a.agent} size={10} />
            </span>
          </span>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          className={footerButton}
          aria-label="Toggle theme"
          title="Dark theme only in v1"
        >
          <Contrast size={18} strokeWidth={1.8} aria-hidden />
        </button>
        <button
          type="button"
          className={footerButton}
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <Settings size={18} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
