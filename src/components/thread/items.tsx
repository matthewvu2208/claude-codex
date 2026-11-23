import { AlertCircle, ChevronRight, Loader2, ShieldAlert, Sparkle } from 'lucide-react';
import { useState } from 'react';
import type { ApprovalDecision } from '../../../shared/events';
import { formatDuration, type ThreadItem, type ToolLine } from '../../lib/thread';

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[75%] self-end rounded-[14px] border border-border-card bg-bubble px-[18px] py-3 text-[15.5px] leading-[1.7] whitespace-pre-wrap">
      {text}
    </div>
  );
}

function workedLabel(item: Extract<ThreadItem, { kind: 'turn' }>): string {
  if (item.running) return 'Working';
  const d = formatDuration(item.durationMs ?? 0);
  if (item.status === 'interrupted') return `Stopped after ${d}`;
  if (item.status === 'failed') return `Failed after ${d}`;
  return `Worked for ${d}`;
}

function ToolRow({ line }: { line: ToolLine }) {
  return (
    <span className={line.ok === false ? 'text-danger' : undefined} data-tool-kind={line.kind}>
      {line.title}
    </span>
  );
}

/** A turn's tool events collapsed into one row; expanding shows one monospace line per tool. */
export function WorkedRow({ item }: { item: Extract<ThreadItem, { kind: 'turn' }> }) {
  const [open, setOpen] = useState(false);
  const label = workedLabel(item);
  const canOpen = item.tools.length > 0;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={canOpen ? open : undefined}
        disabled={!canOpen}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 self-start rounded-md pr-2 pl-0.5 text-[15px] text-secondary enabled:hover:text-primary"
      >
        {item.running ? (
          <Loader2 size={16} strokeWidth={1.8} className="animate-spin" aria-hidden />
        ) : canOpen ? (
          <ChevronRight
            size={16}
            strokeWidth={1.8}
            className={`transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          />
        ) : (
          <Sparkle size={15} strokeWidth={1.8} aria-hidden />
        )}
        {label}
      </button>
      {open && canOpen ? (
        <div className="ml-2.5 flex flex-col border-l border-border-card px-3.5 py-2 font-mono text-[12.5px] leading-[1.8] text-secondary">
          {item.tools.map((t) => (
            <ToolRow key={t.itemId} line={t} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const RESOLVED_COPY: Record<ApprovalDecision | 'cancelled', string> = {
  allow: 'Allowed once',
  'allow-session': 'Allowed for this session',
  deny: 'Denied',
  cancelled: 'No longer needed',
};

function DetailLines({ detail, diff }: { detail: string; diff: boolean }) {
  if (!diff) return <>{detail}</>;
  return (
    <>
      {detail.split('\n').map((line, i) => (
        <span
          key={i}
          className={`block ${line.startsWith('+ ') ? 'text-diff-add' : line.startsWith('- ') ? 'text-diff-remove' : ''}`}
        >
          {line || ' '}
        </span>
      ))}
    </>
  );
}

export function ApprovalCard({
  item,
  agentLabel,
  onDecide,
}: {
  item: Extract<ThreadItem, { kind: 'approval' }>;
  agentLabel: string;
  onDecide: (d: ApprovalDecision) => void;
}) {
  const pending = !item.resolved;
  return (
    <section
      aria-label={`Approval: ${item.title}`}
      className={`flex flex-col gap-3 rounded-xl border bg-surface px-4 py-3.5 ${pending ? 'border-attention/60' : 'border-border-card'}`}
    >
      <div className="flex items-center gap-2.5 text-[15px]">
        <ShieldAlert size={17} strokeWidth={1.8} className="text-attention" aria-hidden />
        <span className="flex-1">
          {agentLabel} wants to{' '}
          {item.approvalKind === 'command'
            ? 'run a command'
            : item.title.charAt(0).toLowerCase() + item.title.slice(1)}
        </span>
      </div>
      {item.detail ? (
        <pre className="m-0 max-h-60 overflow-auto rounded-lg bg-main px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap">
          <DetailLines detail={item.detail} diff={item.approvalKind === 'edit'} />
        </pre>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onDecide('allow')}
            className="h-9 rounded-lg bg-action px-3.5 text-[14px] text-on-action hover:brightness-110"
          >
            Allow once
          </button>
          <button
            type="button"
            onClick={() => onDecide('allow-session')}
            className="h-9 rounded-lg border border-border px-3.5 text-[14px] text-primary hover:bg-raised"
          >
            Allow for session
          </button>
          <button
            type="button"
            onClick={() => onDecide('deny')}
            className="h-9 rounded-lg px-3.5 text-[14px] text-secondary hover:bg-raised hover:text-primary"
          >
            Deny
          </button>
        </div>
      ) : (
        <span className="text-[13px] text-muted">{RESOLVED_COPY[item.resolved!]}</span>
      )}
    </section>
  );
}

export function ErrorRow({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 text-[15px] text-danger">
      <AlertCircle size={17} strokeWidth={1.8} className="mt-[3px] flex-none" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function NoticeRow({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-[14px] text-muted">
      <Loader2 size={14} className="animate-spin" aria-hidden />
      {message}
    </div>
  );
}
