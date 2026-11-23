import type { AgentEvent } from '../../../../shared/events';
import { displayPath, oneLine } from '../claude/mapEvents';
import type { ServerNotification } from './protocol/ServerNotification';
import type { ThreadItem } from './protocol/v2/ThreadItem';
import type { TurnStatus } from './protocol/v2/TurnStatus';

export type NotificationMethod = ServerNotification['method'];
export type NotificationParams<M extends NotificationMethod> = Extract<
  ServerNotification,
  { method: M }
>['params'];

type FileChangeItem = Extract<ThreadItem, { type: 'fileChange' }>;

const TURN_STATUS: Record<TurnStatus, 'completed' | 'interrupted' | 'failed'> = {
  completed: 'completed',
  interrupted: 'interrupted',
  failed: 'failed',
  inProgress: 'failed',
};

/** Unified diff for an approval card, one block per file, paths relative to the session. */
export function fileChangeDetail(item: FileChangeItem, cwd?: string): string {
  return item.changes.map((c) => `${displayPath(c.path, cwd)}\n${c.diff.trimEnd()}`).join('\n\n');
}

export function fileChangeTitle(item: FileChangeItem, cwd?: string): string {
  const paths = item.changes.map((c) => displayPath(c.path, cwd));
  if (paths.length === 0) return 'Edit files';
  return `Edit ${paths.length > 3 ? `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more` : paths.join(', ')}`;
}

function toolStart(sessionId: string, item: ThreadItem, cwd?: string): AgentEvent | null {
  switch (item.type) {
    case 'commandExecution':
      return {
        t: 'tool.started',
        sessionId,
        itemId: item.id,
        kind: 'command',
        title: `Run ${oneLine(item.command)}`,
      };
    case 'fileChange':
      return {
        t: 'tool.started',
        sessionId,
        itemId: item.id,
        kind: 'edit',
        title: fileChangeTitle(item, cwd),
      };
    case 'mcpToolCall':
      return {
        t: 'tool.started',
        sessionId,
        itemId: item.id,
        kind: 'mcp',
        title: `${item.server} · ${item.tool}`,
      };
    case 'dynamicToolCall':
      return {
        t: 'tool.started',
        sessionId,
        itemId: item.id,
        kind: 'mcp',
        title: `hub · ${item.tool}`,
      };
    case 'webSearch':
      return {
        t: 'tool.started',
        sessionId,
        itemId: item.id,
        kind: 'search',
        title: `Search the web for ${item.query}`.trim(),
      };
    case 'imageView':
      return {
        t: 'tool.started',
        sessionId,
        itemId: item.id,
        kind: 'read',
        title: `View ${displayPath(item.path, cwd)}`,
      };
    default:
      return null;
  }
}

function toolOk(item: ThreadItem): boolean | null {
  switch (item.type) {
    case 'commandExecution':
      return item.status === 'completed' && (item.exitCode === null || item.exitCode === 0);
    case 'fileChange':
      return item.status === 'completed';
    case 'mcpToolCall':
      return item.status === 'completed';
    case 'dynamicToolCall':
      return item.success !== false;
    case 'webSearch':
    case 'imageView':
      return true;
    default:
      return null;
  }
}

/** Stateful translation of one Codex thread's notifications into AgentEvents. */
export class CodexEventMapper {
  private readonly fileChanges = new Map<string, FileChangeItem>();
  private readonly started = new Set<string>();
  private readonly turnStart = new Map<string, number>();

  constructor(
    private readonly sessionId: string,
    private readonly cwd?: string,
  ) {}

  /** The diff of a file change item seen in item/started, for its approval card. */
  fileChange(itemId: string): FileChangeItem | undefined {
    return this.fileChanges.get(itemId);
  }

  map(method: string, rawParams: unknown): AgentEvent[] {
    const sessionId = this.sessionId;
    switch (method as NotificationMethod) {
      case 'turn/started': {
        const p = rawParams as NotificationParams<'turn/started'>;
        this.turnStart.set(p.turn.id, Date.now());
        return [{ t: 'turn.started', sessionId, turnId: p.turn.id }];
      }
      case 'turn/completed': {
        const p = rawParams as NotificationParams<'turn/completed'>;
        const { turn } = p;
        const out: AgentEvent[] = [];
        const status = TURN_STATUS[turn.status];
        if (status === 'failed' && turn.error) {
          out.push({ t: 'error', sessionId, message: turn.error.message, retryable: true });
        }
        const startedAt = this.turnStart.get(turn.id);
        this.turnStart.delete(turn.id);
        out.push({
          t: 'turn.done',
          sessionId,
          turnId: turn.id,
          status,
          durationMs: turn.durationMs ?? (startedAt ? Date.now() - startedAt : 0),
        });
        return out;
      }
      case 'item/agentMessage/delta': {
        const p = rawParams as NotificationParams<'item/agentMessage/delta'>;
        return [{ t: 'text.delta', sessionId, itemId: p.itemId, text: p.delta }];
      }
      case 'item/commandExecution/outputDelta': {
        const p = rawParams as NotificationParams<'item/commandExecution/outputDelta'>;
        return [{ t: 'tool.output', sessionId, itemId: p.itemId, chunk: p.delta }];
      }
      case 'item/started': {
        const { item } = rawParams as NotificationParams<'item/started'>;
        if (item.type === 'fileChange') this.fileChanges.set(item.id, item);
        const e = toolStart(sessionId, item, this.cwd);
        if (!e) return [];
        this.started.add(item.id);
        return [e];
      }
      case 'item/completed': {
        const { item } = rawParams as NotificationParams<'item/completed'>;
        if (item.type === 'agentMessage') {
          return item.text.trim()
            ? [{ t: 'text.done', sessionId, itemId: item.id, text: item.text }]
            : [];
        }
        const ok = toolOk(item);
        if (ok === null) return [];
        const out: AgentEvent[] = [];
        // A tool may complete without a started notification (e.g. after a reconnect).
        if (!this.started.has(item.id)) {
          const start = toolStart(sessionId, item, this.cwd);
          if (start) out.push(start);
        }
        this.started.delete(item.id);
        this.fileChanges.delete(item.id);
        out.push({ t: 'tool.done', sessionId, itemId: item.id, ok });
        return out;
      }
      case 'thread/tokenUsage/updated': {
        const p = rawParams as NotificationParams<'thread/tokenUsage/updated'>;
        return [
          {
            t: 'usage',
            sessionId,
            contextTokens: p.tokenUsage.last.totalTokens,
            ...(p.tokenUsage.modelContextWindow
              ? { contextMax: p.tokenUsage.modelContextWindow }
              : {}),
          },
        ];
      }
      case 'error': {
        const p = rawParams as NotificationParams<'error'>;
        return p.willRetry
          ? [{ t: 'notice', sessionId, kind: 'retrying', message: 'Retrying…' }]
          : [{ t: 'error', sessionId, message: p.error.message, retryable: false }];
      }
      default:
        return [];
    }
  }
}
