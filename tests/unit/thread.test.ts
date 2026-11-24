import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../shared/events';
import { buildThread, formatCost, formatDuration, formatTokens } from '../../src/lib/thread';

const S = 'S';
const e = (x: Record<string, unknown>) => ({ sessionId: S, ...x }) as AgentEvent;

describe('buildThread', () => {
  it('closes a turn cut off by a quit when the next turn starts', () => {
    const t = buildThread([
      e({ t: 'turn.started', turnId: 'T1' }),
      e({ t: 'user.message', text: 'again' }),
      e({ t: 'turn.started', turnId: 'T2' }),
      e({ t: 'turn.done', turnId: 'T2', status: 'completed', durationMs: 5 }),
    ]);
    expect(t.running).toBe(false);
    expect(t.items[0]).toMatchObject({ kind: 'turn', running: false, status: 'interrupted' });
  });

  it('groups a turn: user bubble, Worked row with tools, then text', () => {
    const t = buildThread([
      e({ t: 'user.message', text: 'hi' }),
      e({ t: 'turn.started', turnId: 'T1' }),
      e({ t: 'tool.started', itemId: 'a', kind: 'read', title: 'Read a.ts' }),
      e({ t: 'tool.done', itemId: 'a', ok: true }),
      e({ t: 'text.delta', itemId: 'x', text: 'Hel' }),
      e({ t: 'text.delta', itemId: 'x', text: 'lo' }),
    ]);
    expect(t.items.map((i) => i.kind)).toEqual(['user', 'turn', 'text']);
    expect(t.running).toBe(true);
    const turn = t.items[1]!;
    expect(turn.kind === 'turn' && turn.tools).toEqual([
      { itemId: 'a', kind: 'read', title: 'Read a.ts', ok: true },
    ]);
    expect(t.items[2]).toMatchObject({ text: 'Hello', streaming: true });

    const done = buildThread([
      ...[
        e({ t: 'user.message', text: 'hi' }),
        e({ t: 'turn.started', turnId: 'T1' }),
        e({ t: 'text.delta', itemId: 'x', text: 'Hel' }),
      ],
      e({ t: 'text.done', itemId: 'x', text: 'Hello!' }),
      e({ t: 'usage', costUsd: 0.5 }),
      e({ t: 'usage', contextTokens: 60000, contextMax: 200000 }),
      e({ t: 'turn.done', turnId: 'T1', status: 'completed', durationMs: 9000 }),
    ]);
    expect(done.running).toBe(false);
    expect(done.items[2]).toMatchObject({ text: 'Hello!', streaming: false });
    expect(done.items[1]).toMatchObject({ status: 'completed', durationMs: 9000 });
    expect(done.usage).toEqual({ costUsd: 0.5, contextTokens: 60000, contextMax: 200000 });
  });

  it('tracks approvals and cancels ones left open by an ended run', () => {
    const open = buildThread([
      e({ t: 'turn.started', turnId: 'T1' }),
      e({
        t: 'approval.request',
        requestId: 'r',
        kind: 'command',
        title: 'Run a command',
        detail: 'ls',
      }),
    ]);
    expect(open.waiting).toBe(true);
    const allowed = buildThread([
      e({ t: 'turn.started', turnId: 'T1' }),
      e({
        t: 'approval.request',
        requestId: 'r',
        kind: 'command',
        title: 'Run a command',
        detail: 'ls',
      }),
      e({ t: 'approval.resolved', requestId: 'r', decision: 'allow' }),
    ]);
    expect(allowed.waiting).toBe(false);
    expect(allowed.items[1]).toMatchObject({ resolved: 'allow' });
    const stale = buildThread([
      e({ t: 'approval.request', requestId: 'r', kind: 'command', title: 'x', detail: '' }),
    ]);
    expect(stale.items.find((i) => i.kind === 'approval')).toMatchObject({ resolved: 'cancelled' });
  });

  it('shows "Retrying…" only while the turn runs, and errors inline', () => {
    const t = buildThread([
      e({ t: 'turn.started', turnId: 'T1' }),
      e({ t: 'notice', kind: 'retrying', message: 'Retrying…' }),
    ]);
    expect(t.items.at(-1)).toMatchObject({ kind: 'notice' });
    const after = buildThread([
      e({ t: 'turn.started', turnId: 'T1' }),
      e({ t: 'notice', kind: 'retrying', message: 'Retrying…' }),
      e({ t: 'error', message: 'Boom', retryable: false }),
      e({ t: 'turn.done', turnId: 'T1', status: 'failed', durationMs: 1 }),
    ]);
    expect(after.items.map((i) => i.kind)).toEqual(['turn', 'error']);
  });
});

describe('formatting', () => {
  it('formats durations, tokens and cost', () => {
    expect(formatDuration(9000)).toBe('9s');
    expect(formatDuration(65_000)).toBe('1m 5s');
    expect(formatTokens(60_400)).toBe('60k');
    expect(formatTokens(1_200_000)).toBe('1.2M');
    expect(formatTokens(900)).toBe('900');
    expect(formatCost(1)).toBe('$1.00');
    expect(formatCost(0.004)).toBe('<$0.01');
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(12.3)).toBe('$12');
  });
});
