import type { AgentId } from '../../../shared/agents';
import {
  PERSISTED_EVENTS,
  type AgentEvent,
  type ApprovalDecision,
  type EventEnvelope,
} from '../../../shared/events';
import type { Session, SessionStatus } from '../../../shared/models';
import type { Store } from '../store/repositories';
import type { AgentAdapter } from './types';

export interface HubOptions {
  store: Store;
  adapters: Partial<Record<AgentId, AgentAdapter>>;
  /** Receives batches of events for the renderer (every ~16 ms). */
  sink: (batch: EventEnvelope[]) => void;
  /** Called when a session needs the user's attention (approval). */
  notify?: (session: Session, title: string, body: string) => void;
  batchMs?: number;
}

const NEXT_STATUS: Partial<Record<AgentEvent['t'], SessionStatus>> = {
  'turn.started': 'running',
  'approval.request': 'waiting',
  'approval.resolved': 'running',
};

/**
 * Runs sessions on their agents: starts them lazily (resuming by native id), writes the render
 * log, keeps session status current and forwards events to the renderer in small batches.
 */
export class AgentHub {
  private queue: EventEnvelope[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(private readonly o: HubOptions) {
    for (const adapter of Object.values(o.adapters)) {
      if (adapter) this.unsubscribers.push(adapter.onEvent((e) => this.record(e)));
    }
  }

  adapter(agent: AgentId): AgentAdapter {
    const a = this.o.adapters[agent];
    if (!a) throw new Error(`${agent === 'codex' ? 'Codex' : 'Claude'} is not available yet.`);
    return a;
  }

  /** Persist (when part of the render log), update status, queue for the renderer. */
  record(e: AgentEvent): void {
    const { store } = this.o;
    const session = store.sessions.get(e.sessionId);
    if (!session) return;
    const seq = PERSISTED_EVENTS.has(e.t) ? store.events.append(e.sessionId, e.t, e).seq : null;
    this.enqueue({ seq, e });

    let status = NEXT_STATUS[e.t];
    if (e.t === 'turn.done') status = e.status === 'failed' ? 'error' : 'idle';
    if (e.t === 'error' && !e.retryable && !this.adapterFor(session)?.isRunning(session.id))
      status = 'error';
    if (e.t === 'approval.resolved' && !this.adapterFor(session)?.isRunning(session.id))
      status = 'idle';
    if (status && status !== session.status) {
      store.sessions.update(session.id, { status });
      this.enqueue({ seq: null, e: { t: 'session.status', sessionId: session.id, status } });
    }
    if (e.t === 'approval.request')
      this.o.notify?.(session, `${session.title} needs approval`, e.title);
  }

  private adapterFor(session: Session): AgentAdapter | undefined {
    return this.o.adapters[session.agent];
  }

  private enqueue(env: EventEnvelope) {
    this.queue.push(env);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.o.batchMs ?? 16);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    this.o.sink(batch);
  }

  async ensureStarted(session: Session): Promise<void> {
    const adapter = this.adapter(session.agent);
    const { nativeId } = await adapter.start({
      sessionId: session.id,
      cwd: session.worktreePath ?? session.cwd,
      ...(session.model ? { model: session.model } : {}),
      ...(session.effort ? { effort: session.effort } : {}),
      permission: session.permission,
      ...(session.nativeId ? { resumeId: session.nativeId } : {}),
      hubTools: {},
    });
    if (nativeId !== session.nativeId) this.o.store.sessions.update(session.id, { nativeId });
  }

  async send(sessionId: string, text: string): Promise<void> {
    const session = this.o.store.sessions.get(sessionId);
    if (!session) throw new Error('Unknown session');
    this.record({ t: 'user.message', sessionId, text });
    try {
      await this.ensureStarted(session);
      await this.adapter(session.agent).send(sessionId, { text });
    } catch (err) {
      this.record({
        t: 'error',
        sessionId,
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      });
      throw err;
    }
  }

  async interrupt(sessionId: string): Promise<void> {
    const session = this.o.store.sessions.get(sessionId);
    if (session) await this.adapterFor(session)?.interrupt(sessionId);
  }

  async approve(sessionId: string, requestId: string, decision: ApprovalDecision): Promise<void> {
    const session = this.o.store.sessions.get(sessionId);
    if (session) await this.adapterFor(session)?.respondApproval(requestId, decision);
  }

  async close(sessionId: string): Promise<void> {
    const session = this.o.store.sessions.get(sessionId);
    if (session) await this.adapterFor(session)?.close(sessionId);
  }

  async shutdown(): Promise<void> {
    this.flush();
    for (const u of this.unsubscribers) u();
    for (const s of this.o.store.sessions.list()) await this.adapterFor(s)?.close(s.id);
    for (const adapter of Object.values(this.o.adapters)) await adapter?.closeAll?.();
  }
}
