import { z } from 'zod';
import { AgentIdSchema } from './models';

/** One agent's plan usage, as the sidebar card shows it. Null fields are unknown ("—"). */
export const UsageSnapshotSchema = z.object({
  agent: AgentIdSchema,
  /** 0–100 */
  percent: z.number().min(0).max(100).nullable(),
  /** "Weekly · all models", "5-hour", … */
  window: z.string().nullable(),
  /** Epoch milliseconds. */
  resetsAt: z.number().nullable(),
  /** allowed | allowed_warning | rejected (Claude), or the limit reached (Codex). */
  status: z.string().nullable(),
  updatedAt: z.number(),
});
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>;

export const UsageStateSchema = z.object({
  claude: UsageSnapshotSchema.nullable(),
  codex: UsageSnapshotSchema.nullable(),
});
export type UsageState = z.infer<typeof UsageStateSchema>;

const CLAUDE_WINDOWS: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'Weekly · all models',
  seven_day_opus: 'Weekly · Opus',
  seven_day_sonnet: 'Weekly · Sonnet',
  seven_day_overage_included: 'Weekly · all models',
  overage: 'Extra usage',
};

/** Label for Claude's `rateLimitType`; unknown types are shown as-is, never guessed. */
export function claudeWindowLabel(type: string | undefined | null): string | null {
  if (!type) return null;
  return CLAUDE_WINDOWS[type] ?? type.replace(/_/g, ' ');
}

/** Label for Codex's `windowDurationMins`. */
export function codexWindowLabel(mins: number | null | undefined): string | null {
  if (!mins || mins <= 0) return null;
  if (mins % 10080 === 0) return mins === 10080 ? 'Weekly' : `${mins / 10080}-week`;
  if (mins % 1440 === 0) return mins === 1440 ? 'Daily' : `${mins / 1440}-day`;
  if (mins % 60 === 0) return `${mins / 60}-hour`;
  return `${mins}-minute`;
}

/**
 * Claude's `utilization`: the SDK does not document its scale, so values up to 1 are read as a
 * fraction and larger ones as a percentage. Out-of-range values are unknown.
 */
export function utilizationPercent(u: number | null | undefined): number | null {
  if (typeof u !== 'number' || !Number.isFinite(u) || u < 0) return null;
  const pct = u <= 1 ? u * 100 : u;
  return pct > 100 ? null : Math.round(pct);
}

/** Epoch seconds or milliseconds → milliseconds. */
export function toMs(t: number | null | undefined): number | null {
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return null;
  return t < 1e12 ? t * 1000 : t;
}

/** "3d", "5h", "20m", "now" until `resetsAt`. */
export function formatReset(resetsAt: number | null, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const ms = resetsAt - now;
  if (ms <= 0) return 'now';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
