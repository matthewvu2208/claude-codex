import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CODEX_PERMISSIONS,
  CodexAdapter,
  planLabel,
} from '../../electron/main/agents/codex/CodexAdapter';
import { createFakeAppServer } from '../../electron/main/agents/codex/fakeServer';
import { CodexEventMapper } from '../../electron/main/agents/codex/mapEvents';
import { RpcClient, type Transport } from '../../electron/main/agents/codex/rpc';
import type { AgentEvent } from '../../shared/events';

/** In-memory transport wired to the scripted app-server; `kill()` simulates a crash. */
function fakeTransport() {
  const lineCbs: ((l: string) => void)[] = [];
  const closeCbs: ((r: string) => void)[] = [];
  let alive = true;
  const server = createFakeAppServer((line) => {
    if (alive) setTimeout(() => lineCbs.forEach((cb) => cb(line)), 0);
  });
  const transport: Transport = {
    write: (line) => {
      if (alive) setTimeout(() => server(line), 0);
    },
    onLine: (cb) => lineCbs.push(cb),
    onClose: (cb) => closeCbs.push(cb),
    close: () => kill(),
  };
  const kill = () => {
    if (!alive) return;
    alive = false;
    closeCbs.forEach((cb) => cb('killed'));
  };
  return { transport, kill };
}

function collector(adapter: CodexAdapter) {
  const events: AgentEvent[] = [];
  adapter.onEvent((e) => events.push(e));
  const until = (pred: (e: AgentEvent) => boolean, timeout = 5000) =>
    new Promise<AgentEvent>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const hit = events.find(pred);
        if (hit) return resolve(hit);
        if (Date.now() - start > timeout)
          return reject(new Error(`timed out; saw ${events.map((e) => e.t).join(',')}`));
        setTimeout(tick, 10);
      };
      tick();
    });
  return { events, until };
}

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'codex-unit-'));
  process.env['CLAUDE_CODEX_FAKE_DIR'] = cwd;
  writeFileSync(join(cwd, 'notes.txt'), 'status: draft\n');
  writeFileSync(join(cwd, 'README.md'), '# Demo\n');
  const transports: ReturnType<typeof fakeTransport>[] = [];
  const opened: string[] = [];
  const adapter = new CodexAdapter({
    connect: () => {
      const t = fakeTransport();
      transports.push(t);
      return t.transport;
    },
    openExternal: (url) => opened.push(url),
  });
  return { cwd, adapter, transports, opened, ...collector(adapter) };
}

describe('RpcClient', () => {
  it('matches responses to requests, reports errors, and answers server requests', async () => {
    const lines: string[] = [];
    let deliver: (l: string) => void = () => undefined;
    const rpc = new RpcClient({
      write: (l) => lines.push(l),
      onLine: (cb) => (deliver = cb),
      onClose: () => undefined,
      close: () => undefined,
    });
    const a = rpc.request<{ ok: boolean }>('model/list', {});
    const b = rpc.request('account/read', {});
    const [first, second] = lines.map((l) => JSON.parse(l) as { id: number });
    deliver(JSON.stringify({ id: second!.id, error: { code: -1, message: 'nope' } }));
    deliver(JSON.stringify({ id: first!.id, result: { ok: true } }));
    await expect(a).resolves.toEqual({ ok: true });
    await expect(b).rejects.toThrow('nope');

    rpc.onRequest(async (method) => ({ decision: method === 'x' ? 'accept' : 'decline' }));
    deliver(JSON.stringify({ id: 99, method: 'x', params: {} }));
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ id: 99, result: { decision: 'accept' } });

    const seen: string[] = [];
    rpc.onNotification((m) => seen.push(m));
    deliver(JSON.stringify({ method: 'turn/started', params: {} }));
    deliver('not json');
    expect(seen).toEqual(['turn/started']);
  });
});

describe('CodexEventMapper', () => {
  it('maps turns, messages, commands and file changes', () => {
    const m = new CodexEventMapper('S', '/w');
    const out = [
      m.map('turn/started', { threadId: 'T', turn: { id: 't1' } }),
      m.map('item/agentMessage/delta', { threadId: 'T', turnId: 't1', itemId: 'm', delta: 'Hi' }),
      m.map('item/completed', { item: { type: 'agentMessage', id: 'm', text: 'Hi there' } }),
      m.map('item/started', { item: { type: 'commandExecution', id: 'c', command: 'npm   test' } }),
      m.map('item/completed', {
        item: {
          type: 'commandExecution',
          id: 'c',
          command: 'npm test',
          status: 'completed',
          exitCode: 1,
        },
      }),
      m.map('item/started', {
        item: {
          type: 'fileChange',
          id: 'f',
          changes: [{ path: '/w/src/a.ts', diff: '-a\n+b' }],
          status: 'inProgress',
        },
      }),
      m.map('item/completed', {
        item: { type: 'fileChange', id: 'f', changes: [], status: 'completed' },
      }),
      m.map('thread/tokenUsage/updated', {
        tokenUsage: { last: { totalTokens: 1234 }, modelContextWindow: 272000 },
      }),
      m.map('error', { error: { message: 'busy' }, willRetry: true }),
      m.map('turn/completed', {
        turn: { id: 't1', status: 'interrupted', durationMs: 900, error: null },
      }),
    ].flat();
    expect(out).toEqual([
      { t: 'turn.started', sessionId: 'S', turnId: 't1' },
      { t: 'text.delta', sessionId: 'S', itemId: 'm', text: 'Hi' },
      { t: 'text.done', sessionId: 'S', itemId: 'm', text: 'Hi there' },
      { t: 'tool.started', sessionId: 'S', itemId: 'c', kind: 'command', title: 'Run npm test' },
      { t: 'tool.done', sessionId: 'S', itemId: 'c', ok: false },
      { t: 'tool.started', sessionId: 'S', itemId: 'f', kind: 'edit', title: 'Edit src/a.ts' },
      { t: 'tool.done', sessionId: 'S', itemId: 'f', ok: true },
      { t: 'usage', sessionId: 'S', contextTokens: 1234, contextMax: 272000 },
      { t: 'notice', sessionId: 'S', kind: 'retrying', message: 'Retrying…' },
      { t: 'turn.done', sessionId: 'S', turnId: 't1', status: 'interrupted', durationMs: 900 },
    ]);
  });

  it('turns a failed turn with an error into an error row', () => {
    const m = new CodexEventMapper('S');
    const out = m.map('turn/completed', {
      turn: { id: 't', status: 'failed', durationMs: 1, error: { message: 'Quota' } },
    });
    expect(out.map((e) => e.t)).toEqual(['error', 'turn.done']);
  });
});

describe('permissions and plans', () => {
  it('maps the four modes to approval policy + sandbox', () => {
    expect(CODEX_PERMISSIONS.ask).toEqual({
      approvalPolicy: 'untrusted',
      sandbox: 'workspace-write',
    });
    expect(CODEX_PERMISSIONS['read-only'].sandbox).toBe('read-only');
    expect(CODEX_PERMISSIONS.full).toEqual({
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });
  });

  it('labels ChatGPT plans', () => {
    expect(planLabel('go')).toBe('ChatGPT Go');
    expect(planLabel('enterprise_cbp_usage_based')).toBe('ChatGPT Enterprise');
    expect(planLabel(null)).toBeNull();
  });
});

describe('CodexAdapter with the scripted app-server', () => {
  it('reports the account, models and browser sign-in', async () => {
    const { adapter, opened } = setup();
    expect(await adapter.status()).toMatchObject({
      signedIn: true,
      plan: 'ChatGPT Go',
      initial: 'T',
      method: 'ChatGPT account',
    });
    expect((await adapter.listModels())[0]).toMatchObject({
      value: 'gpt-test',
      efforts: ['low', 'medium'],
      defaultEffort: 'medium',
    });
    await adapter.signIn();
    expect(opened).toEqual(['https://auth.example.com/login']);
    await adapter.closeAll();
  });

  it('runs a turn: command, streamed message, usage, completion', async () => {
    const { cwd, adapter, until, events } = setup();
    const { nativeId } = await adapter.start({
      sessionId: 'S',
      cwd,
      permission: 'ask',
      hubTools: {},
    });
    expect(nativeId).toBeTruthy();
    await adapter.send('S', { text: 'read the readme' });
    await until((e) => e.t === 'turn.done');
    expect(events.map((e) => e.t)).toEqual(
      expect.arrayContaining([
        'turn.started',
        'tool.started',
        'tool.output',
        'tool.done',
        'text.delta',
        'text.done',
        'usage',
        'turn.done',
      ]),
    );
    expect(events.find((e) => e.t === 'tool.started')).toMatchObject({
      title: 'Run cat README.md',
    });
    expect(adapter.isRunning('S')).toBe(false);
    await adapter.closeAll();
  });

  it('asks before a file change; accept applies it, decline does not', async () => {
    const { cwd, adapter, until, events } = setup();
    await adapter.start({ sessionId: 'S', cwd, permission: 'ask', hubTools: {} });
    await adapter.send('S', { text: 'edit notes' });
    const req = await until((e) => e.t === 'approval.request');
    if (req.t !== 'approval.request') throw new Error('unexpected');
    expect(req).toMatchObject({ kind: 'edit', title: 'Edit notes.txt' });
    expect(req.detail).toContain('+status: final');
    await adapter.respondApproval(req.requestId, 'allow');
    await until((e) => e.t === 'turn.done');
    expect(readFileSync(join(cwd, 'notes.txt'), 'utf8')).toBe('status: final\n');

    writeFileSync(join(cwd, 'notes.txt'), 'status: draft\n');
    events.length = 0;
    await adapter.send('S', { text: 'edit again' });
    const req2 = await until((e) => e.t === 'approval.request');
    await adapter.respondApproval((req2 as { requestId: string }).requestId, 'deny');
    await until((e) => e.t === 'turn.done');
    expect(readFileSync(join(cwd, 'notes.txt'), 'utf8')).toBe('status: draft\n');
    await adapter.closeAll();
  });

  it('interrupts a running turn', async () => {
    const { cwd, adapter, until } = setup();
    await adapter.start({ sessionId: 'S', cwd, permission: 'ask', hubTools: {} });
    await adapter.send('S', { text: 'go slow' });
    await until((e) => e.t === 'text.delta');
    expect(adapter.isRunning('S')).toBe(true);
    await adapter.interrupt('S');
    expect(await until((e) => e.t === 'turn.done')).toMatchObject({ status: 'interrupted' });
    await adapter.closeAll();
  });

  it('resumes a thread by id and keeps its history', async () => {
    const { cwd, adapter, until } = setup();
    const { nativeId } = await adapter.start({
      sessionId: 'S',
      cwd,
      permission: 'ask',
      hubTools: {},
    });
    await adapter.send('S', { text: 'hello' });
    await until((e) => e.t === 'turn.done');
    await adapter.closeAll();

    const next = setup();
    process.env['CLAUDE_CODEX_FAKE_DIR'] = cwd;
    await next.adapter.start({
      sessionId: 'S',
      cwd,
      permission: 'ask',
      hubTools: {},
      resumeId: nativeId,
    });
    await next.adapter.send('S', { text: 'do you remember?' });
    await next.until((e) => e.t === 'text.done');
    expect(next.events.find((e) => e.t === 'text.done')).toMatchObject({
      text: expect.stringContaining('I remember 1 earlier'),
    });
    await next.adapter.closeAll();
  });

  it('ends the running turn when the process dies, then reconnects and resumes', async () => {
    const { cwd, adapter, until, transports, events } = setup();
    await adapter.start({ sessionId: 'S', cwd, permission: 'ask', hubTools: {} });
    await adapter.send('S', { text: 'slow' });
    await until((e) => e.t === 'text.delta');
    transports[0]!.kill();
    expect(await until((e) => e.t === 'turn.done')).toMatchObject({ status: 'failed' });
    expect(events.some((e) => e.t === 'error')).toBe(true);
    // Backoff starts at 1s; a new process is spawned and the thread resumed.
    await new Promise((r) => setTimeout(r, 1300));
    expect(transports).toHaveLength(2);
    await adapter.send('S', { text: 'hello again' });
    await until((e) => e.t === 'text.done' && e.text.includes('Hello'));
    await adapter.closeAll();
  });
});
