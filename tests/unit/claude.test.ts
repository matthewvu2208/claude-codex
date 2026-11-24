import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  ClaudeAdapter,
  PERMISSION_MODES,
  type QueryFn,
} from '../../electron/main/agents/claude/ClaudeAdapter';
import { fakeQuery } from '../../electron/main/agents/claude/fakeQuery';
import {
  approvalContent,
  ClaudeEventMapper,
  displayPath,
  toolKind,
  toolTitle,
} from '../../electron/main/agents/claude/mapEvents';
import type { AgentEvent } from '../../shared/events';

const noHub = { call: async () => ({ ok: false as const, error: 'unused' }) };

const msg = (m: Record<string, unknown>) =>
  ({ parent_tool_use_id: null, uuid: 'u', session_id: 's', ...m }) as unknown as SDKMessage;

describe('tool mapping', () => {
  it('classifies tools', () => {
    expect(toolKind('Read')).toBe('read');
    expect(toolKind('Edit')).toBe('edit');
    expect(toolKind('Bash')).toBe('command');
    expect(toolKind('Grep')).toBe('search');
    expect(toolKind('mcp__hub__start_subsession')).toBe('mcp');
    expect(toolKind('Task')).toBe('other');
  });

  it('titles tools with paths relative to the session folder', () => {
    expect(toolTitle('Read', { file_path: '/work/app/src/a.ts' }, '/work/app')).toBe(
      'Read src/a.ts',
    );
    expect(toolTitle('Read', { file_path: '/elsewhere/a.ts' }, '/work/app')).toBe(
      'Read /elsewhere/a.ts',
    );
    expect(toolTitle('Bash', { command: 'npm   test\n  --watch' })).toBe('Run npm test --watch');
    expect(toolTitle('mcp__hub__start_subsession', {})).toBe('hub · start_subsession');
    expect(displayPath('relative.ts', '/x')).toBe('relative.ts');
  });

  it('builds approval cards for commands and edits', () => {
    expect(approvalContent('Bash', { command: 'rm -r build' })).toEqual({
      kind: 'command',
      title: 'Run a command',
      detail: 'rm -r build',
    });
    const edit = approvalContent(
      'Edit',
      { file_path: '/w/a.ts', old_string: 'a\nb', new_string: 'c' },
      '/w',
    );
    expect(edit.title).toBe('Edit a.ts');
    expect(edit.detail).toBe('- a\n- b\n+ c');
    expect(approvalContent('WebFetch', { url: 'https://x' }).kind).toBe('tool');
  });
});

describe('ClaudeEventMapper', () => {
  it('maps streaming text, final text, tools and tool results', () => {
    const m = new ClaudeEventMapper('S', '/w');
    const events = [
      msg({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } }),
      msg({
        type: 'stream_event',
        event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      }),
      msg({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hel' },
        },
      }),
      msg({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'Hello' }] } }),
      msg({
        type: 'assistant',
        message: {
          id: 'm2',
          content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/w/a.ts' } }],
        },
      }),
      msg({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }],
        },
      }),
      msg({ type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 3 }),
      msg({
        type: 'assistant',
        parent_tool_use_id: 'sub',
        message: { id: 'm3', content: [{ type: 'text', text: 'inside a subagent' }] },
      }),
    ].flatMap((e) => m.map(e));
    expect(events).toEqual([
      { t: 'text.delta', sessionId: 'S', itemId: 'm1:text:0', text: 'Hel' },
      { t: 'text.done', sessionId: 'S', itemId: 'm1:text:0', text: 'Hello' },
      { t: 'tool.started', sessionId: 'S', itemId: 't1', kind: 'read', title: 'Read a.ts' },
      { t: 'tool.done', sessionId: 'S', itemId: 't1', ok: false },
      { t: 'notice', sessionId: 'S', kind: 'retrying', message: 'Retrying… (attempt 1 of 3)' },
    ]);
  });

  it('turns assistant errors into readable errors', () => {
    const m = new ClaudeEventMapper('S');
    const [e] = m.map(
      msg({ type: 'assistant', error: 'authentication_failed', message: { id: 'm', content: [] } }),
    );
    expect(e).toMatchObject({ t: 'error', retryable: false });
    expect((e as { message: string }).message).toMatch(/not signed in/);
  });
});

describe('permission mapping', () => {
  it('follows the plan table', () => {
    expect(PERMISSION_MODES).toEqual({
      ask: 'default',
      'auto-edit': 'acceptEdits',
      'read-only': 'plan',
      full: 'bypassPermissions',
    });
  });
});

/** Collects events until `until` matches one. */
function collector(adapter: ClaudeAdapter) {
  const events: AgentEvent[] = [];
  const waiters: { pred: (e: AgentEvent) => boolean; resolve: (e: AgentEvent) => void }[] = [];
  adapter.onEvent((e) => {
    events.push(e);
    for (const w of [...waiters]) {
      if (w.pred(e)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(e);
      }
    }
  });
  const until = (pred: (e: AgentEvent) => boolean) =>
    new Promise<AgentEvent>((resolve, reject) => {
      const hit = events.find(pred);
      if (hit) return resolve(hit);
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error('timed out')), 5000);
    });
  return { events, until };
}

describe('ClaudeAdapter with the scripted agent', () => {
  const setup = () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cc-unit-'));
    process.env['CLAUDE_CODEX_FAKE_DIR'] = cwd;
    writeFileSync(join(cwd, 'notes.txt'), 'draft');
    const adapter = new ClaudeAdapter({
      queryFn: fakeQuery as QueryFn,
      binaryPath: null,
      authStatus: async () => ({ loggedIn: true, authMethod: 'fake' }),
    });
    return { cwd, adapter, ...collector(adapter) };
  };

  it('runs a turn, then reports cost, context and completion', async () => {
    const { cwd, adapter, until, events } = setup();
    const { nativeId } = await adapter.start({
      sessionId: 'S',
      cwd,
      permission: 'ask',
      hubTools: noHub,
    });
    expect(nativeId).toMatch(/[0-9a-f-]{36}/);
    await adapter.send('S', { text: 'hello' });
    const done = await until((e) => e.t === 'turn.done');
    expect(done).toMatchObject({ status: 'completed' });
    await until((e) => e.t === 'usage' && e.contextTokens !== undefined);
    expect(events.find((e) => e.t === 'usage' && e.costUsd !== undefined)).toBeTruthy();
    expect(events.filter((e) => e.t === 'turn.started')).toHaveLength(1);
    await adapter.close('S');
  });

  it('asks for approval, and allow-once lets the edit run', async () => {
    const { cwd, adapter, until } = setup();
    await adapter.start({ sessionId: 'S', cwd, permission: 'ask', hubTools: noHub });
    await adapter.send('S', { text: 'edit it' });
    const req = await until((e) => e.t === 'approval.request');
    if (req.t !== 'approval.request') throw new Error('unexpected');
    expect(req).toMatchObject({ kind: 'edit', title: 'Edit notes.txt' });
    await adapter.respondApproval(req.requestId, 'allow');
    await until((e) => e.t === 'turn.done');
    expect(readFileSync(join(cwd, 'notes.txt'), 'utf8')).toBe('final');
    await adapter.close('S');
  });

  it('interrupts a running turn and cancels open approvals', async () => {
    const { cwd, adapter, until } = setup();
    await adapter.start({ sessionId: 'S', cwd, permission: 'ask', hubTools: noHub });
    await adapter.send('S', { text: 'slow please' });
    await until((e) => e.t === 'text.delta');
    expect(adapter.isRunning('S')).toBe(true);
    await adapter.interrupt('S');
    const done = await until((e) => e.t === 'turn.done');
    expect(done).toMatchObject({ status: 'interrupted' });
    expect(adapter.isRunning('S')).toBe(false);
    await adapter.close('S');
  });

  it('queues a message sent during a turn as the next turn', async () => {
    const { cwd, adapter, until, events } = setup();
    await adapter.start({ sessionId: 'S', cwd, permission: 'ask', hubTools: noHub });
    await adapter.send('S', { text: 'one' });
    await adapter.send('S', { text: 'two' });
    await until(
      (e) => e.t === 'turn.done' && events.filter((x) => x.t === 'turn.done').length === 2,
    );
    const order = events
      .filter((e) => e.t === 'turn.started' || e.t === 'turn.done')
      .map((e) => e.t);
    expect(order).toEqual(['turn.started', 'turn.done', 'turn.started', 'turn.done']);
    await adapter.close('S');
  });

  it('reports account status and models without reading tokens', async () => {
    const { adapter } = setup();
    const status = await adapter.status();
    expect(status).toMatchObject({
      signedIn: true,
      plan: 'Max',
      initial: 'T',
      method: 'Claude account',
    });
    const models = await adapter.listModels();
    expect(models[0]).toMatchObject({ value: 'opus', displayName: 'Opus 5.5' });
  });

  it('reports signed out when Claude Code says so', async () => {
    const adapter = new ClaudeAdapter({
      queryFn: fakeQuery as QueryFn,
      binaryPath: null,
      authStatus: async () => ({ loggedIn: false, authMethod: null }),
    });
    expect(await adapter.status()).toMatchObject({ signedIn: false, plan: null });
  });
});
