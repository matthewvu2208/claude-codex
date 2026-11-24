import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentAdapter } from '../../electron/main/agents/types';
import { UsageService } from '../../electron/main/services/usage';
import { openDatabase } from '../../electron/main/store/db';
import { createStore } from '../../electron/main/store/repositories';
import {
  claudeWindowLabel,
  codexWindowLabel,
  formatReset,
  toMs,
  utilizationPercent,
  type UsageSnapshot,
  type UsageState,
} from '../../shared/usage';

describe('usage helpers', () => {
  it('labels Claude windows and never guesses unknown ones', () => {
    expect(claudeWindowLabel('five_hour')).toBe('5-hour');
    expect(claudeWindowLabel('seven_day')).toBe('Weekly · all models');
    expect(claudeWindowLabel('seven_day_opus')).toBe('Weekly · Opus');
    expect(claudeWindowLabel('brand_new_window')).toBe('brand new window');
    expect(claudeWindowLabel(undefined)).toBeNull();
  });

  it('labels Codex windows from minutes', () => {
    expect(codexWindowLabel(300)).toBe('5-hour');
    expect(codexWindowLabel(10080)).toBe('Weekly');
    expect(codexWindowLabel(1440)).toBe('Daily');
    expect(codexWindowLabel(2880)).toBe('2-day');
    expect(codexWindowLabel(45)).toBe('45-minute');
    expect(codexWindowLabel(null)).toBeNull();
    expect(codexWindowLabel(0)).toBeNull();
  });

  it('reads utilization as a fraction or a percentage, and rejects nonsense', () => {
    expect(utilizationPercent(0.57)).toBe(57);
    expect(utilizationPercent(1)).toBe(100);
    expect(utilizationPercent(42)).toBe(42);
    expect(utilizationPercent(0)).toBe(0);
    expect(utilizationPercent(150)).toBeNull();
    expect(utilizationPercent(-1)).toBeNull();
    expect(utilizationPercent(Number.NaN)).toBeNull();
    expect(utilizationPercent(undefined)).toBeNull();
  });

  it('converts seconds to milliseconds and formats the reset countdown', () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toMs(0)).toBeNull();
    const now = 1_000_000_000_000;
    expect(formatReset(null, now)).toBeNull();
    expect(formatReset(now - 1, now)).toBe('now');
    expect(formatReset(now + 20 * 60_000, now)).toBe('20m');
    expect(formatReset(now + 5 * 3_600_000, now)).toBe('5h');
    expect(formatReset(now + 3 * 86_400_000, now)).toBe('3d');
  });
});

function usageAdapter(id: 'claude' | 'codex') {
  const listeners = new Set<(u: UsageSnapshot, raw: unknown) => void>();
  let refreshes = 0;
  const adapter = {
    id,
    onUsage: (cb: (u: UsageSnapshot, raw: unknown) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    refreshUsage: async () => void refreshes++,
  } as unknown as AgentAdapter;
  const emit = (u: Partial<UsageSnapshot>, raw: unknown = { raw: true }) => {
    for (const l of listeners)
      l(
        {
          agent: id,
          percent: null,
          window: null,
          resetsAt: null,
          status: null,
          updatedAt: 1,
          ...u,
        },
        raw,
      );
  };
  return { adapter, emit, refreshes: () => refreshes, listeners };
}

describe('UsageService', () => {
  it('pushes updates, persists the last snapshot and restores it after a restart', () => {
    const store = createStore(openDatabase(':memory:'));
    const claude = usageAdapter('claude');
    const pushed: UsageState[] = [];
    const service = new UsageService({
      adapters: { claude: claude.adapter },
      settings: store.settings,
      push: (s) => pushed.push(s),
    });
    expect(service.read()).toEqual({ claude: null, codex: null });
    claude.emit({ percent: 57, window: 'Weekly · all models', status: 'allowed' });
    expect(pushed).toHaveLength(1);
    expect(service.read().claude).toMatchObject({ percent: 57, window: 'Weekly · all models' });
    service.stop();
    expect(claude.listeners.size).toBe(0);

    const again = new UsageService({ adapters: {}, settings: store.settings, push: () => {} });
    expect(again.read().claude).toMatchObject({ percent: 57 });
    expect(again.read().codex).toBeNull();
  });

  it('ignores a corrupt saved snapshot', () => {
    const store = createStore(openDatabase(':memory:'));
    store.settings.set('usage:codex', { percent: 'lots' });
    const service = new UsageService({ adapters: {}, settings: store.settings, push: () => {} });
    expect(service.read().codex).toBeNull();
  });

  it('refreshes every adapter that can, and survives a failing one', async () => {
    const store = createStore(openDatabase(':memory:'));
    const codex = usageAdapter('codex');
    const broken = {
      ...usageAdapter('claude').adapter,
      refreshUsage: async () => {
        throw new Error('offline');
      },
    } as AgentAdapter;
    const service = new UsageService({
      adapters: { codex: codex.adapter, claude: broken },
      settings: store.settings,
      push: () => {},
    });
    await service.refresh();
    expect(codex.refreshes()).toBe(1);
    service.stop();
  });

  it('writes raw payloads to the spike log only when asked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-spike-'));
    const log = join(dir, 'usage-spike.jsonl');
    const store = createStore(openDatabase(':memory:'));
    const claude = usageAdapter('claude');
    const service = new UsageService({
      adapters: { claude: claude.adapter },
      settings: store.settings,
      push: () => {},
      spikeLog: log,
    });
    claude.emit({ percent: 10 }, { utilization: 0.1, rateLimitType: 'five_hour' });
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      agent: 'claude',
      raw: { utilization: 0.1, rateLimitType: 'five_hour' },
    });
    service.stop();
  });
});
