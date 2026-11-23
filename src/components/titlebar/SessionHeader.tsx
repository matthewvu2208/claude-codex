import { EllipsisVertical } from 'lucide-react';
import { useState } from 'react';
import type { Session } from '../../../shared/models';
import { formatCost, formatTokens, type ThreadState } from '../../lib/thread';

interface SessionHeaderProps {
  session: Session;
  usage: ThreadState['usage'];
  onRename: (title: string) => void;
  onMenu: (at: { x: number; y: number }) => void;
}

/** Centered title with inline rename and the session menu. */
export function SessionTitle({ session, onRename, onMenu }: Omit<SessionHeaderProps, 'usage'>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.title);
  return (
    <span className="no-drag flex min-w-[200px] flex-1 items-center justify-center gap-2">
      {editing ? (
        <input
          aria-label="Session title"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            setEditing(false);
            if (value.trim() && value !== session.title) onRename(value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setValue(session.title);
              setEditing(false);
            }
          }}
          className="w-[360px] rounded-md border border-border bg-input px-2 py-0.5 text-center text-[15px] text-primary outline-none"
        />
      ) : (
        <h1 className="m-0 min-w-0 truncate text-[15px] font-normal">
          <button
            type="button"
            className="max-w-[480px] truncate rounded-md px-1.5 py-0.5 hover:bg-raised"
            title="Rename"
            onClick={() => {
              setValue(session.title);
              setEditing(true);
            }}
          >
            {session.title}
          </button>
        </h1>
      )}
      <button
        type="button"
        aria-label="Session menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
        }}
        className="flex size-7 items-center justify-center rounded-md text-secondary hover:bg-raised"
      >
        <EllipsisVertical size={16} strokeWidth={1.8} aria-hidden />
      </button>
    </span>
  );
}

/** Context bar with token count, and session cost. */
export function SessionMeters({ usage }: { usage: ThreadState['usage'] }) {
  const { contextTokens, contextMax, costUsd } = usage;
  const pct = contextTokens && contextMax ? Math.min(100, (contextTokens / contextMax) * 100) : 0;
  return (
    <>
      {contextTokens !== undefined ? (
        <span
          title={`Context used${contextMax ? ` of ${formatTokens(contextMax)}` : ''}`}
          aria-label={`Context ${formatTokens(contextTokens)} tokens`}
          className="flex items-center gap-2 font-mono text-[13px] text-row"
        >
          {formatTokens(contextTokens)}
          <span aria-hidden className="h-1 w-[110px] rounded-sm bg-border">
            <span className="block h-1 rounded-sm bg-context-fill" style={{ width: `${pct}%` }} />
          </span>
        </span>
      ) : null}
      {costUsd !== undefined ? (
        <span
          title="Cost this session (estimate)"
          aria-label={`Cost ${formatCost(costUsd)}`}
          className="flex items-center gap-1.5 font-mono text-[13px] text-row"
        >
          <span aria-hidden className="size-2 rounded-full bg-attention" />
          {formatCost(costUsd)}
        </span>
      ) : null}
    </>
  );
}
