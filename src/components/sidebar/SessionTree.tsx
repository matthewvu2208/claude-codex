import { ChevronDown, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { AGENT_LABELS } from '../../../shared/agents';
import { buildSessionTree, flattenTree, type SessionNodeInput } from '../../../shared/sessionTree';
import { AgentIcon } from '../common/AgentIcon';

export interface TreeFolder {
  id: string;
  name: string;
  sessions: SessionNodeInput[];
}

interface SessionTreeProps {
  folders: TreeFolder[];
  activeId: string | null;
  filter: string;
  renamingId?: string | null;
  onOpen: (id: string) => void;
  onMenu?: (id: string, at: { x: number; y: number }) => void;
  onRename?: (id: string, title: string) => void;
  onCancelRename?: () => void;
  onStartRename?: (id: string) => void;
}

function RenameInput({
  initial,
  onDone,
  onCancel,
}: {
  initial: string;
  onDone: (t: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      aria-label="Session title"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value);
        if (e.key === 'Escape') onCancel();
      }}
      className="min-w-0 flex-1 rounded-md border border-border bg-input px-1.5 py-0.5 text-primary outline-none"
    />
  );
}

function RowIcon({
  node,
}: {
  node: { session: SessionNodeInput; dotAgent: SessionNodeInput['agent'] | null };
}) {
  const { session, dotAgent } = node;
  if (session.status === 'running') {
    return (
      <span
        className="flex size-[18px] flex-none items-center justify-center text-secondary"
        data-status="running"
      >
        <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden />
      </span>
    );
  }
  return (
    <span className="relative flex-none" data-status={session.status ?? 'idle'}>
      <AgentIcon agent={session.agent} size={18} dot={dotAgent} />
      {session.status === 'waiting' ? (
        <span
          aria-hidden
          className="absolute -top-[3px] -right-[3px] box-content size-2 rounded-full border-2 border-sidebar bg-attention"
        />
      ) : null}
    </span>
  );
}

export function SessionTree({
  folders,
  activeId,
  filter,
  renamingId,
  onOpen,
  onMenu,
  onRename,
  onCancelRename,
  onStartRename,
}: SessionTreeProps) {
  const rowMenu = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    onMenu?.(id, { x: Math.round(e.clientX), y: Math.round(e.clientY) });
  };
  const rowKeys = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      onMenu?.(id, { x: Math.round(r.left + 24), y: Math.round(r.bottom) });
    } else if (e.key === 'F2') {
      e.preventDefault();
      onStartRename?.(id);
    }
  };
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const query = filter.trim().toLocaleLowerCase();

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const trees = useMemo(
    () =>
      folders.map((folder) => {
        const sessions = query
          ? folder.sessions.filter((s) => s.title.toLocaleLowerCase().includes(query))
          : folder.sessions;
        return { folder, roots: buildSessionTree(sessions) };
      }),
    [folders, query],
  );

  return (
    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto" role="tree" aria-label="Sessions">
      {trees.map(({ folder, roots }) => {
        if (query && roots.length === 0) return null;
        const folderOpen = !collapsedFolders.has(folder.id);
        const rows = folderOpen ? flattenTree(roots, query ? new Set() : collapsed) : [];
        return (
          <div key={folder.id} className="flex flex-col gap-px" role="group">
            <button
              type="button"
              role="treeitem"
              aria-expanded={folderOpen}
              aria-level={1}
              className="flex h-9 items-center gap-2.5 rounded-[9px] px-2 text-left text-[14px] text-label hover:bg-raised/60"
              onClick={() => setCollapsedFolders((c) => toggle(c, folder.id))}
            >
              <Folder size={17} strokeWidth={1.7} aria-hidden />
              <span className="min-w-0 truncate">{folder.name}</span>
            </button>
            {rows.map((node) => {
              const { session, depth, dotAgent } = node;
              const isParent = node.children.length > 0;
              const isChild = depth > 0;
              const open = !collapsed.has(session.id);
              const active = session.id === activeId;
              const live =
                session.status === 'running'
                  ? ', working'
                  : session.status === 'waiting'
                    ? ', needs approval'
                    : '';
              const label = `${session.title} (${AGENT_LABELS[session.agent]}${
                dotAgent ? `, with a ${AGENT_LABELS[dotAgent]} sub-session` : ''
              }${live})`;
              const icon = <RowIcon node={node} />;
              return (
                <div
                  key={session.id}
                  onContextMenu={rowMenu(session.id)}
                  className={`group flex min-h-9 items-center gap-2 rounded-[9px] pr-2.5 text-[14px] ${
                    active ? 'bg-raised text-strong' : 'text-row hover:bg-raised/60'
                  }`}
                  style={{ paddingLeft: isChild ? 30 + (depth - 1) * 20 : isParent ? 10 : 32 }}
                >
                  {isChild ? (
                    <span
                      aria-hidden
                      className="-mt-2.5 h-3.5 w-2.5 flex-none rounded-bl border-b border-l border-tree-line"
                    />
                  ) : null}
                  {isParent ? (
                    <button
                      type="button"
                      className="-mx-0.5 flex size-[18px] flex-none items-center justify-center rounded text-muted hover:text-row"
                      aria-label={open ? `Collapse ${session.title}` : `Expand ${session.title}`}
                      aria-expanded={open}
                      onClick={() => setCollapsed((c) => toggle(c, session.id))}
                    >
                      {open ? (
                        <ChevronDown size={14} strokeWidth={2} aria-hidden />
                      ) : (
                        <ChevronRight size={14} strokeWidth={2} aria-hidden />
                      )}
                    </button>
                  ) : null}
                  {renamingId === session.id ? (
                    <>
                      <RenameInput
                        initial={session.title}
                        onDone={(t) => onRename?.(session.id, t)}
                        onCancel={() => onCancelRename?.()}
                      />
                      {icon}
                    </>
                  ) : (
                    <button
                      type="button"
                      role="treeitem"
                      aria-level={depth + 2}
                      aria-selected={active}
                      aria-label={label}
                      data-session-id={session.id}
                      className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left outline-offset-0"
                      onClick={() => onOpen(session.id)}
                      onKeyDown={rowKeys(session.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">{session.title}</span>
                      {icon}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
