import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  onOpen: (id: string) => void;
}

export function SessionTree({ folders, activeId, filter, onOpen }: SessionTreeProps) {
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
              const label = `${session.title} (${AGENT_LABELS[session.agent]}${
                dotAgent ? `, with a ${AGENT_LABELS[dotAgent]} sub-session` : ''
              })`;
              return (
                <div
                  key={session.id}
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
                  <button
                    type="button"
                    role="treeitem"
                    aria-level={depth + 2}
                    aria-selected={active}
                    aria-label={label}
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left outline-offset-0"
                    onClick={() => onOpen(session.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <AgentIcon agent={session.agent} size={18} dot={dotAgent} />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
