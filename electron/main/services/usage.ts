import { appendFileSync } from 'node:fs';
import type { AgentId } from '../../../shared/agents';
import { UsageSnapshotSchema, type UsageSnapshot, type UsageState } from '../../../shared/usage';
import type { AgentAdapter } from '../agents/types';
import type { SettingsRepo } from '../store/repositories';

export const USAGE_REFRESH_MS = 5 * 60_000;

export interface UsageServiceOptions {
  adapters: Partial<Record<AgentId, AgentAdapter>>;
  settings: SettingsRepo;
  /** Sends the latest state to the renderer. */
  push: (state: UsageState) => void;
  /**
   * The M9 spike: when set, every raw rate-limit payload is appended here as JSON lines, so the
   * real formats can be checked before labels are trusted. Payloads hold no tokens.
   */
  spikeLog?: string | null;
  intervalMs?: number;
}

/**
 * Plan usage for the sidebar card: Claude from `rate_limit_event`s that arrive with replies,
 * Codex from `account/rateLimits` (read on start, then updates, plus a 5-minute refresh).
 * The last snapshot per agent is kept in settings so the card is filled after a restart.
 */
export class UsageService {
  private state: UsageState;
  private timer: NodeJS.Timeout | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly o: UsageServiceOptions) {
    const saved = o.settings.all();
    const load = (agent: AgentId) => {
      const parsed = UsageSnapshotSchema.safeParse(saved[`usage:${agent}`]);
      return parsed.success ? parsed.data : null;
    };
    this.state = { claude: load('claude'), codex: load('codex') };
    for (const adapter of Object.values(o.adapters)) {
      if (!adapter) continue;
      this.offs.push(adapter.onUsage((u, raw) => this.update(u, raw)));
    }
  }

  read(): UsageState {
    return this.state;
  }

  private update(u: UsageSnapshot, raw: unknown) {
    this.state = { ...this.state, [u.agent]: u };
    this.o.settings.set(`usage:${u.agent}`, u);
    if (this.o.spikeLog) {
      try {
        appendFileSync(
          this.o.spikeLog,
          `${JSON.stringify({ at: new Date().toISOString(), agent: u.agent, raw })}\n`,
        );
      } catch {
        // The spike log is best effort.
      }
    }
    this.o.push(this.state);
  }

  async refresh(): Promise<UsageState> {
    await Promise.all(
      Object.values(this.o.adapters).map((a) => a?.refreshUsage?.().catch(() => undefined)),
    );
    return this.state;
  }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.o.intervalMs ?? USAGE_REFRESH_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const off of this.offs) off();
  }
}
