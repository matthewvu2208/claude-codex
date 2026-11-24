import { AGENT_LABELS, type AgentId, type Permission } from '../../../shared/agents';
import type { AgentEvent } from '../../../shared/events';
import {
  HUB_TOOLS,
  type HubToolName,
  type HubToolResult,
  type SubsessionStatus,
} from '../../../shared/hubTools';
import type { Session } from '../../../shared/models';
import type { Store } from '../store/repositories';
import type { AgentHub } from './hub';
import type { HubTools } from './types';

export const MAX_DEPTH = 2;
export const DEFAULT_CHILD_LIMIT = 3;
export const REPORT_LIMIT = 8000;

export interface OrchestratorOptions {
  store: Store;
  hub: AgentHub;
  /** Running children allowed per parent (setting `subsessionLimit`). */
  childLimit?: () => number;
  /** Model and effort a new session on this agent starts with (Welcome defaults). */
  defaults?: (agent: AgentId) => { model: string | null; effort: string | null };
  /** `git diff --stat` for a folder, or null when it is not a repo. */
  diffStat?: (cwd: string) => Promise<string | null>;
}

/**
 * The most a child may do: never more than its parent, never Full access. Read-only stays
 * read-only; workspace-write takes the parent's own mode, so an Ask parent gives an Ask child.
 */
export function childPermission(
  parent: Permission,
  requested: 'read-only' | 'workspace-write',
): Permission {
  if (requested === 'read-only' || parent === 'read-only') return 'read-only';
  if (parent === 'full') return 'auto-edit';
  return parent;
}

/** Report text pushed into the parent; long answers are cut with a pointer to the child. */
export function buildReport(r: {
  child: Session;
  status: 'completed' | 'failed' | 'interrupted';
  message: string;
  durationMs: number;
  diffStat: string | null;
}): { body: string; text: string } {
  let body = r.message.trim() || '(No final message.)';
  // Keep the stat's column alignment: drop only blank lines and trailing space.
  if (r.diffStat?.trim()) body += `\n\nFiles changed:\n${r.diffStat.replace(/^\n+|\s+$/g, '')}`;
  if (body.length > REPORT_LIMIT) {
    body = `${body.slice(0, REPORT_LIMIT)}\n…\n(Report cut at 8,000 characters. Open the sub-session for the full answer.)`;
  }
  const seconds = Math.max(0, Math.round(r.durationMs / 1000));
  const attrs = [
    `id="${r.child.id}"`,
    `agent="${r.child.agent}"`,
    `title="${r.child.title.replace(/"/g, "'")}"`,
    `status="${r.status}"`,
    `duration="${seconds}s"`,
  ].join(' ');
  return { body, text: `<subsession_report ${attrs}>\n${body}\n</subsession_report>` };
}

interface ChildTurn {
  messages: string[];
  startedAt: number;
}

/**
 * Owns sub-sessions: every session gets the hub tools; starting a child creates its session row,
 * shows a card in the parent and runs the child; when a child's turn ends, its report goes back
 * into the parent, which continues.
 */
export class Orchestrator {
  /** Children started and not yet reported, per parent (the concurrency guard). */
  private readonly active = new Map<string, Set<string>>();
  private readonly turns = new Map<string, ChildTurn>();
  private readonly lastReport = new Map<string, { status: SubsessionStatus; summary: string }>();

  constructor(private readonly o: OrchestratorOptions) {
    o.hub.hubToolsFor = (sessionId) => this.toolsFor(sessionId);
    o.hub.observe((e, session) => void this.observe(e, session));
  }

  toolsFor(parentId: string): HubTools {
    return { call: (name, args) => this.call(parentId, name, args) };
  }

  /** Children of a session that are still running, for "Also stop N sub-sessions?". */
  runningChildren(parentId: string): string[] {
    return [...(this.active.get(parentId) ?? [])];
  }

  async call(parentId: string, name: string, raw: unknown): Promise<HubToolResult> {
    if (!(name in HUB_TOOLS)) return { ok: false, error: `Unknown tool ${name}` };
    const parsed = HUB_TOOLS[name as HubToolName].input.safeParse(raw);
    if (!parsed.success) return { ok: false, error: `Invalid arguments: ${parsed.error.message}` };
    try {
      switch (name as HubToolName) {
        case 'start_subsession':
          return await this.start(parentId, parsed.data as never);
        case 'subsession_status':
          return this.status(parentId, (parsed.data as { id: string }).id);
        case 'send_to_subsession': {
          const { id, message } = parsed.data as { id: string; message: string };
          const child = this.childOf(parentId, id);
          if (!child)
            return { ok: false, error: 'No sub-session with that id under this session.' };
          this.track(parentId, id);
          await this.o.hub.send(id, message);
          return { ok: true };
        }
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    return { ok: false, error: `Unknown tool ${name}` };
  }

  private childOf(parentId: string, id: string): Session | null {
    const child = this.o.store.sessions.get(id);
    return child && child.parentId === parentId ? child : null;
  }

  private track(parentId: string, childId: string) {
    const set = this.active.get(parentId) ?? new Set<string>();
    set.add(childId);
    this.active.set(parentId, set);
  }

  private async start(
    parentId: string,
    args: {
      agent: AgentId;
      title: string;
      prompt: string;
      access: 'read-only' | 'workspace-write';
    },
  ): Promise<HubToolResult> {
    const { store, hub } = this.o;
    const parent = store.sessions.get(parentId);
    if (!parent) return { ok: false, error: 'Unknown parent session.' };
    if (store.sessions.depth(parentId) >= MAX_DEPTH) {
      return {
        ok: false,
        error: `Sub-sessions can be nested at most ${MAX_DEPTH} deep. Do this work here instead.`,
      };
    }
    const limit = this.o.childLimit?.() ?? DEFAULT_CHILD_LIMIT;
    if ((this.active.get(parentId)?.size ?? 0) >= limit) {
      return {
        ok: false,
        error: `At most ${limit} sub-sessions can run at once. Wait for a report before starting another.`,
      };
    }
    const defaults = this.o.defaults?.(args.agent) ?? { model: null, effort: null };
    const permission = childPermission(parent.permission, args.access);
    const child = store.sessions.create({
      folderId: parent.folderId,
      parentId,
      agent: args.agent,
      title: args.title,
      cwd: parent.cwd,
      worktreePath: parent.worktreePath,
      branch: parent.branch,
      model: defaults.model,
      effort: defaults.effort,
      permission,
    });
    this.track(parentId, child.id);
    hub.record({
      t: 'subsession.started',
      sessionId: parentId,
      childId: child.id,
      summary: child.title,
    });
    // Runs in the background; the parent gets the report when the child's turn ends.
    void hub.send(child.id, args.prompt).catch(() => undefined);
    return {
      ok: true,
      id: child.id,
      agent: AGENT_LABELS[args.agent],
      access: permission,
      note: 'The report arrives later as a <subsession_report> message.',
    };
  }

  private status(parentId: string, id: string): HubToolResult {
    const child = this.childOf(parentId, id);
    if (!child) return { ok: false, error: 'No sub-session with that id under this session.' };
    const report = this.lastReport.get(id);
    const running = this.active.get(parentId)?.has(id);
    const status: SubsessionStatus = running
      ? child.status === 'waiting'
        ? 'waiting'
        : 'running'
      : (report?.status ?? (child.status === 'error' ? 'failed' : 'running'));
    return {
      ok: true,
      status,
      ...(report && !running ? { summary: report.summary.slice(0, 2000) } : {}),
    };
  }

  private async observe(e: AgentEvent, session: Session) {
    if (!session.parentId) return;
    if (e.t === 'turn.started') this.turns.set(session.id, { messages: [], startedAt: Date.now() });
    if (e.t === 'text.done') this.turns.get(session.id)?.messages.push(e.text);
    if (e.t !== 'turn.done') return;

    const turn = this.turns.get(session.id);
    this.turns.delete(session.id);
    const parentId = session.parentId;
    this.active.get(parentId)?.delete(session.id);
    const diffStat = (await this.o.diffStat?.(session.worktreePath ?? session.cwd)) ?? null;
    const { body, text } = buildReport({
      child: session,
      status: e.status,
      message: turn?.messages.at(-1) ?? '',
      durationMs: e.durationMs,
      diffStat,
    });
    this.lastReport.set(session.id, {
      status: e.status === 'completed' ? 'done' : 'failed',
      summary: body,
    });
    this.o.hub.record({
      t: 'subsession.reported',
      sessionId: parentId,
      childId: session.id,
      summary: body,
    });
    await this.o.hub.deliver(parentId, text);
  }
}
