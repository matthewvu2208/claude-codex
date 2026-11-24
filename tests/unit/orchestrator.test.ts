import { beforeEach, describe, expect, it } from 'vitest';
import { HUB_ALLOWED_TOOLS, hubMcpServer } from '../../electron/main/agents/claude/ClaudeAdapter';
import { HUB_DYNAMIC_TOOLS } from '../../electron/main/agents/codex/CodexAdapter';
import { AgentHub } from '../../electron/main/agents/hub';
import {
  buildReport,
  childPermission,
  Orchestrator,
  REPORT_LIMIT,
} from '../../electron/main/agents/orchestrator';
import type { AgentAdapter } from '../../electron/main/agents/types';
import { openDatabase } from '../../electron/main/store/db';
import { createStore, type Store } from '../../electron/main/store/repositories';
import type { AgentId } from '../../shared/agents';
import type { AgentEvent } from '../../shared/events';

/** Adapter stub: records sends; the test ends turns by emitting events. */
function stub(id: AgentId) {
  const listeners = new Set<(e: AgentEvent) => void>();
  const sent: { sessionId: string; text: string }[] = [];
  const running = new Set<string>();
  const adapter: AgentAdapter = {
    id,
    status: async () => ({
      agent: id,
      installed: true,
      signedIn: true,
      method: null,
      plan: null,
      initial: null,
      hasApiKey: false,
      error: null,
    }),
    start: async (o) => ({ nativeId: o.resumeId ?? `native-${o.sessionId}` }),
    send: async (sessionId, input) => {
      sent.push({ sessionId, text: input.text });
      running.add(sessionId);
      for (const l of listeners) l({ t: 'turn.started', sessionId, turnId: `t-${sent.length}` });
    },
    interrupt: async () => undefined,
    respondApproval: async () => undefined,
    setModel: async () => 'applied',
    setEffort: async () => 'applied',
    setPermission: async () => 'applied',
    listModels: async () => [],
    listCommands: async () => [],
    readUsage: async () => null,
    onUsage: () => () => undefined,
    isRunning: (s) => running.has(s),
    close: async () => undefined,
    onEvent: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const emit = (e: AgentEvent) => {
    if (e.t === 'turn.done') running.delete(e.sessionId);
    for (const l of listeners) l(e);
  };
  return { adapter, sent, emit };
}

let store: Store;
let hub: AgentHub;
let orch: Orchestrator;
let claude: ReturnType<typeof stub>;
let codex: ReturnType<typeof stub>;
let parentId: string;
let limit = 3;

/** The id a successful start_subsession returned. */
const idOf = (r: unknown): string => {
  const v = r as { ok: boolean; id?: string };
  if (!v.ok || !v.id) throw new Error(`start failed: ${JSON.stringify(r)}`);
  return v.id;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  store = createStore(openDatabase(':memory:'));
  claude = stub('claude');
  codex = stub('codex');
  hub = new AgentHub({
    store,
    adapters: { claude: claude.adapter, codex: codex.adapter },
    sink: () => undefined,
  });
  limit = 3;
  orch = new Orchestrator({
    store,
    hub,
    childLimit: () => limit,
    defaults: (agent) => ({ model: agent === 'codex' ? 'gpt-test' : 'opus', effort: 'low' }),
    diffStat: async () => ' notes.txt | 2 +-',
  });
  const folder = store.folders.upsert('/w', 'w');
  parentId = store.sessions.create({
    folderId: folder.id,
    agent: 'claude',
    title: 'Parent',
    cwd: '/w',
    permission: 'ask',
  }).id;
});

const startChild = (
  from: string,
  access: 'read-only' | 'workspace-write' = 'read-only',
  agent: AgentId = 'codex',
) =>
  orch
    .toolsFor(from)
    .call('start_subsession', { agent, title: 'Review', prompt: 'Please review', access });

describe('start_subsession', () => {
  it('creates a child under the parent, records a card and sends the prompt', async () => {
    const r = await startChild(parentId);
    expect(r).toMatchObject({ ok: true, agent: 'Codex', access: 'read-only' });
    const id = idOf(r);
    const child = store.sessions.get(id)!;
    expect(child).toMatchObject({
      parentId,
      agent: 'codex',
      cwd: '/w',
      model: 'gpt-test',
      effort: 'low',
      permission: 'read-only',
    });
    expect(store.events.list(parentId).map((e) => e.type)).toContain('subsession.started');
    await flush();
    expect(codex.sent).toEqual([{ sessionId: id, text: 'Please review' }]);
  });

  it('rejects bad arguments', async () => {
    expect(await orch.toolsFor(parentId).call('start_subsession', { agent: 'gpt' })).toMatchObject({
      ok: false,
    });
    expect(await orch.toolsFor(parentId).call('nope', {})).toMatchObject({ ok: false });
  });

  it('allows depth two and refuses depth three', async () => {
    const child = idOf(await startChild(parentId));
    const grandchild = await startChild(child);
    expect(grandchild).toMatchObject({ ok: true });
    const tooDeep = await startChild(idOf(grandchild));
    expect(tooDeep).toMatchObject({ ok: false, error: expect.stringMatching(/at most 2 deep/) });
  });

  it('caps running children per parent, and frees a slot when one reports', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push(idOf(await startChild(parentId)));
    expect(await startChild(parentId)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/At most 3/),
    });
    expect(orch.runningChildren(parentId)).toHaveLength(3);

    await flush();
    codex.emit({
      t: 'turn.done',
      sessionId: ids[0]!,
      turnId: 'x',
      status: 'completed',
      durationMs: 5,
    });
    await flush();
    expect(orch.runningChildren(parentId)).toHaveLength(2);
    expect(await startChild(parentId)).toMatchObject({ ok: true });

    limit = 1;
    expect(await startChild(parentId)).toMatchObject({ ok: false });
  });

  it('never gives a child more access than its parent', () => {
    expect(childPermission('ask', 'workspace-write')).toBe('ask');
    expect(childPermission('auto-edit', 'workspace-write')).toBe('auto-edit');
    expect(childPermission('read-only', 'workspace-write')).toBe('read-only');
    expect(childPermission('full', 'workspace-write')).toBe('auto-edit');
    expect(childPermission('full', 'read-only')).toBe('read-only');
  });
});

describe('report-back', () => {
  it('reports the child turn into the parent without a user bubble, and the parent continues', async () => {
    const id = idOf(await startChild(parentId));
    await flush();
    codex.emit({ t: 'text.done', sessionId: id, itemId: 'a', text: 'Looking…' });
    codex.emit({ t: 'text.done', sessionId: id, itemId: 'b', text: 'Two problems found.' });
    codex.emit({
      t: 'turn.done',
      sessionId: id,
      turnId: 'x',
      status: 'completed',
      durationMs: 9000,
    });
    await flush();
    await flush();

    const parentEvents = store.events.list(parentId).map((e) => e.type);
    expect(parentEvents).toEqual(['subsession.started', 'subsession.reported', 'turn.started']);
    expect(parentEvents).not.toContain('user.message');
    const delivered = claude.sent.at(-1)!;
    expect(delivered.sessionId).toBe(parentId);
    expect(delivered.text).toMatch(
      /^<subsession_report id="[^"]+" agent="codex" title="Review" status="completed" duration="9s">/,
    );
    expect(delivered.text).toContain('Two problems found.');
    expect(delivered.text).toContain('Files changed:\n notes.txt | 2 +-');
    expect(delivered.text).not.toContain('Looking…');

    expect(await orch.toolsFor(parentId).call('subsession_status', { id })).toMatchObject({
      ok: true,
      status: 'done',
    });
  });

  it('cuts long reports at 8,000 characters with a pointer to the sub-session', () => {
    const child = { id: 'c', agent: 'codex', title: 'T "x"' } as never;
    const { body, text } = buildReport({
      child,
      status: 'completed',
      message: 'y'.repeat(9000),
      durationMs: 0,
      diffStat: null,
    });
    expect(body.length).toBeLessThan(REPORT_LIMIT + 200);
    expect(body).toMatch(/Open the sub-session for the full answer\.\)$/);
    expect(text).toContain(`title="T 'x'"`);
  });

  it('send_to_subsession only reaches the caller’s own children', async () => {
    const id = idOf(await startChild(parentId));
    const folder = store.folders.list()[0]!;
    const stranger = store.sessions.create({
      folderId: folder.id,
      agent: 'claude',
      title: 'Other',
      cwd: '/w',
      permission: 'ask',
    }).id;
    expect(
      await orch.toolsFor(stranger).call('send_to_subsession', { id, message: 'hi' }),
    ).toMatchObject({ ok: false });
    expect(
      await orch.toolsFor(parentId).call('send_to_subsession', { id, message: 'more please' }),
    ).toEqual({ ok: true });
  });
});

describe('agent wiring', () => {
  it('Claude gets the hub tools as an in-process MCP server, allowed without approval cards', () => {
    const server = hubMcpServer({ call: async () => ({ ok: true }) });
    expect(server).toMatchObject({ type: 'sdk', name: 'hub' });
    expect(HUB_ALLOWED_TOOLS).toEqual([
      'mcp__hub__start_subsession',
      'mcp__hub__subsession_status',
      'mcp__hub__send_to_subsession',
    ]);
  });

  it('Codex gets the same tools as dynamic tools with JSON Schema', () => {
    expect(HUB_DYNAMIC_TOOLS.map((t) => t.name)).toEqual([
      'start_subsession',
      'subsession_status',
      'send_to_subsession',
    ]);
    const start = HUB_DYNAMIC_TOOLS[0]!.inputSchema as {
      properties: Record<string, { enum?: string[] }>;
      required: string[];
    };
    expect(start.properties['agent']!.enum).toEqual(['claude', 'codex']);
    expect(start.required).toEqual(['agent', 'title', 'prompt', 'access']);
  });
});
