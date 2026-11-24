import type { Attachment } from '../../shared/attachments';
import type { AgentEvent, ApprovalDecision, ToolKind } from '../../shared/events';

export interface ToolLine {
  itemId: string;
  kind: ToolKind;
  title: string;
  ok?: boolean;
}

export type ThreadItem =
  | { kind: 'user'; key: string; text: string; attachments?: Attachment[] }
  | {
      kind: 'turn';
      key: string;
      turnId: string;
      tools: ToolLine[];
      running: boolean;
      status?: 'completed' | 'interrupted' | 'failed';
      durationMs?: number;
    }
  | { kind: 'text'; key: string; itemId: string; text: string; streaming: boolean }
  | {
      kind: 'approval';
      key: string;
      requestId: string;
      approvalKind: 'command' | 'edit' | 'tool';
      title: string;
      detail: string;
      resolved?: ApprovalDecision | 'cancelled';
    }
  | { kind: 'subsession'; key: string; childId: string; title: string; reported: boolean }
  | { kind: 'reported'; key: string; childId: string; title: string; report: string; ts?: number }
  | { kind: 'error'; key: string; message: string }
  | { kind: 'notice'; key: string; message: string };

export interface ThreadState {
  items: ThreadItem[];
  usage: { contextTokens?: number; contextMax?: number; costUsd?: number };
  running: boolean;
  waiting: boolean;
}

type TurnItem = Extract<ThreadItem, { kind: 'turn' }>;
type TextItem = Extract<ThreadItem, { kind: 'text' }>;
type ApprovalItem = Extract<ThreadItem, { kind: 'approval' }>;

/** Folds a session's events, in order, into what the thread shows. */
export function buildThread(
  events: readonly AgentEvent[],
  /** Timestamps of stored events, by position, for "reported back · 8:14 PM". */
  times?: readonly (number | undefined)[],
): ThreadState {
  const items: ThreadItem[] = [];
  const texts = new Map<string, TextItem>();
  const turns = new Map<string, TurnItem>();
  const tools = new Map<string, ToolLine>();
  const approvals = new Map<string, ApprovalItem>();
  const usage: ThreadState['usage'] = {};
  let current: TurnItem | null = null;
  let notice: string | null = null;
  const cards = new Map<string, Extract<ThreadItem, { kind: 'subsession' }>>();

  const ensureTurn = (): TurnItem => {
    if (current) return current;
    // Events that arrive outside a turn get an implicit one so tools still group.
    const turn: TurnItem = {
      kind: 'turn',
      key: `turn:implicit:${items.length}`,
      turnId: '',
      tools: [],
      running: false,
    };
    current = turn;
    items.push(turn);
    return turn;
  };

  for (const [index, e] of events.entries()) {
    switch (e.t) {
      case 'subsession.started': {
        const card: Extract<ThreadItem, { kind: 'subsession' }> = {
          kind: 'subsession',
          key: `sub:${e.childId}`,
          childId: e.childId,
          title: e.summary ?? 'Sub-session',
          reported: false,
        };
        cards.set(e.childId, card);
        items.push(card);
        break;
      }
      case 'subsession.reported': {
        const card = cards.get(e.childId);
        if (card) card.reported = true;
        const ts = times?.[index];
        items.push({
          kind: 'reported',
          key: `reported:${e.childId}:${items.length}`,
          childId: e.childId,
          title: card?.title ?? 'Sub-session',
          report: e.summary ?? '',
          ...(ts !== undefined ? { ts } : {}),
        });
        break;
      }
      case 'user.message':
        items.push({
          kind: 'user',
          key: `user:${items.length}`,
          text: e.text,
          ...(e.attachments?.length ? { attachments: e.attachments } : {}),
        });
        break;
      case 'turn.started': {
        // Turns run one at a time; one still open here was cut off (the app quit mid-turn).
        if (current?.running) {
          current.running = false;
          current.status = 'interrupted';
        }
        const turn: TurnItem = {
          kind: 'turn',
          key: `turn:${e.turnId}`,
          turnId: e.turnId,
          tools: [],
          running: true,
        };
        current = turn;
        turns.set(e.turnId, turn);
        items.push(turn);
        break;
      }
      case 'text.delta':
      case 'text.done': {
        let item = texts.get(e.itemId);
        if (!item) {
          ensureTurn();
          item = {
            kind: 'text',
            key: `text:${e.itemId}`,
            itemId: e.itemId,
            text: '',
            streaming: true,
          };
          texts.set(e.itemId, item);
          items.push(item);
        }
        if (e.t === 'text.delta') item.text += e.text;
        else {
          item.text = e.text;
          item.streaming = false;
        }
        break;
      }
      case 'tool.started': {
        const line: ToolLine = { itemId: e.itemId, kind: e.kind, title: e.title };
        tools.set(e.itemId, line);
        ensureTurn().tools.push(line);
        break;
      }
      case 'tool.done': {
        const line = tools.get(e.itemId);
        if (line) line.ok = e.ok;
        break;
      }
      case 'approval.request': {
        ensureTurn();
        const item: ApprovalItem = {
          kind: 'approval',
          key: `approval:${e.requestId}`,
          requestId: e.requestId,
          approvalKind: e.kind,
          title: e.title,
          detail: e.detail,
        };
        approvals.set(e.requestId, item);
        items.push(item);
        break;
      }
      case 'approval.resolved': {
        const item = approvals.get(e.requestId);
        if (item) item.resolved = e.decision;
        break;
      }
      case 'usage':
        if (e.contextTokens !== undefined) usage.contextTokens = e.contextTokens;
        if (e.contextMax !== undefined) usage.contextMax = e.contextMax;
        if (e.costUsd !== undefined) usage.costUsd = e.costUsd;
        break;
      case 'turn.done': {
        const turn: TurnItem | null = turns.get(e.turnId) ?? current;
        if (turn) {
          turn.running = false;
          turn.status = e.status;
          turn.durationMs = e.durationMs;
        }
        for (const t of texts.values()) t.streaming = false;
        if (turn === current) current = null;
        notice = null;
        break;
      }
      case 'error':
        items.push({ kind: 'error', key: `error:${items.length}`, message: e.message });
        break;
      case 'notice':
        notice = e.message;
        break;
      default:
        break;
    }
  }

  const running = items.some((i) => i.kind === 'turn' && i.running);
  // An approval left open by a run that has ended (e.g. the app quit) is no longer actionable.
  for (const a of approvals.values()) if (!a.resolved && !running) a.resolved = 'cancelled';
  const waiting = [...approvals.values()].some((a) => !a.resolved);
  const out: ThreadItem[] =
    notice && running ? [...items, { kind: 'notice', key: 'notice', message: notice }] : items;
  return { items: out, usage, running, waiting };
}

/** "9s", "1m 5s" */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/** "60k", "1.2M" */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01';
  if (usd < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}
