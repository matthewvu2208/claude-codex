import { z } from 'zod';
import { AGENT_IDS } from './agents';

/** Sub-session tools every session gets, identical for Claude and Codex (docs/PLAN.md). */
export const HUB_TOOLS = {
  start_subsession: {
    description:
      'Start a sub-session on Claude or Codex to work on a task in parallel, in the same folder. ' +
      'Returns the sub-session id at once. When the sub-session finishes, its report arrives ' +
      'later as a <subsession_report> message; do not poll for it in a loop.',
    input: z.object({
      agent: z.enum(AGENT_IDS).describe('Which agent runs the sub-session'),
      title: z.string().min(1).max(120).describe('Short title shown to the user'),
      prompt: z.string().min(1).max(50_000).describe('The full task for the sub-session'),
      access: z
        .enum(['read-only', 'workspace-write'])
        .describe('read-only for reviews and research; workspace-write if it must edit files'),
    }),
  },
  subsession_status: {
    description: 'Check a sub-session started with start_subsession.',
    input: z.object({ id: z.string().min(1).max(64) }),
  },
  send_to_subsession: {
    description:
      'Send a follow-up message to a sub-session. Its next report arrives as a <subsession_report> message.',
    input: z.object({ id: z.string().min(1).max(64), message: z.string().min(1).max(50_000) }),
  },
} as const;

export type HubToolName = keyof typeof HUB_TOOLS;
export const HUB_TOOL_NAMES = Object.keys(HUB_TOOLS) as HubToolName[];
export type HubToolInput<N extends HubToolName> = z.infer<(typeof HUB_TOOLS)[N]['input']>;

export type SubsessionStatus = 'running' | 'waiting' | 'done' | 'failed';

/** What a hub tool call returns to the agent (sent back as JSON text). */
export type HubToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
