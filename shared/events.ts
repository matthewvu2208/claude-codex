import { z } from 'zod';
import { AttachmentSchema } from './attachments';
import { AgentIdSchema, SessionStatusSchema } from './models';

const base = { sessionId: z.string() };

export const ToolKindSchema = z.enum(['read', 'edit', 'command', 'search', 'mcp', 'other']);
export type ToolKind = z.infer<typeof ToolKindSchema>;
export const ApprovalDecisionSchema = z.enum(['allow', 'allow-session', 'deny']);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/**
 * The one event model both adapters emit (docs/PLAN.md › Adapter contract), plus the few
 * app-level events the thread needs (user messages, approvals resolved, notices, status).
 */
export const AgentEventSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('user.message'),
    ...base,
    text: z.string(),
    attachments: z.array(AttachmentSchema).optional(),
  }),
  z.object({ t: z.literal('turn.started'), ...base, turnId: z.string() }),
  z.object({ t: z.literal('text.delta'), ...base, itemId: z.string(), text: z.string() }),
  z.object({ t: z.literal('text.done'), ...base, itemId: z.string(), text: z.string() }),
  z.object({
    t: z.literal('tool.started'),
    ...base,
    itemId: z.string(),
    kind: ToolKindSchema,
    title: z.string(),
  }),
  z.object({ t: z.literal('tool.output'), ...base, itemId: z.string(), chunk: z.string() }),
  z.object({ t: z.literal('tool.done'), ...base, itemId: z.string(), ok: z.boolean() }),
  z.object({
    t: z.literal('approval.request'),
    ...base,
    requestId: z.string(),
    kind: z.enum(['command', 'edit', 'tool']),
    title: z.string(),
    detail: z.string(),
  }),
  z.object({
    t: z.literal('approval.resolved'),
    ...base,
    requestId: z.string(),
    decision: ApprovalDecisionSchema.or(z.literal('cancelled')),
  }),
  z.object({
    t: z.literal('subsession.started'),
    ...base,
    childId: z.string(),
    summary: z.string().optional(),
  }),
  z.object({
    t: z.literal('subsession.reported'),
    ...base,
    childId: z.string(),
    summary: z.string().optional(),
  }),
  z.object({
    t: z.literal('usage'),
    ...base,
    contextTokens: z.number().optional(),
    contextMax: z.number().optional(),
    costUsd: z.number().optional(),
  }),
  z.object({
    t: z.literal('turn.done'),
    ...base,
    turnId: z.string(),
    status: z.enum(['completed', 'interrupted', 'failed']),
    durationMs: z.number(),
  }),
  z.object({ t: z.literal('error'), ...base, message: z.string(), retryable: z.boolean() }),
  /** Quiet, transient status line ("Retrying…"). */
  z.object({ t: z.literal('notice'), ...base, kind: z.enum(['retrying']), message: z.string() }),
  z.object({ t: z.literal('session.status'), ...base, status: SessionStatusSchema }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventOf<T extends AgentEvent['t']> = Extract<AgentEvent, { t: T }>;

/** What main pushes on `agent:event`: persisted events carry their render-log seq. */
export const EventEnvelopeSchema = z.object({
  seq: z.number().int().nullable(),
  e: AgentEventSchema,
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export const EventBatchSchema = z.array(EventEnvelopeSchema);

/** Events written to the render log; deltas and notices are live-only. */
export const PERSISTED_EVENTS: ReadonlySet<AgentEvent['t']> = new Set([
  'user.message',
  'turn.started',
  'text.done',
  'tool.started',
  'tool.done',
  'approval.request',
  'approval.resolved',
  'subsession.started',
  'subsession.reported',
  'usage',
  'turn.done',
  'error',
]);

export const AccountStatusSchema = z.object({
  agent: AgentIdSchema,
  installed: z.boolean(),
  signedIn: z.boolean(),
  /** How the agent is signed in, e.g. "Claude account" or "API key". */
  method: z.string().nullable(),
  /** Plan label for the Welcome card, e.g. "Max", "Pro". */
  plan: z.string().nullable(),
  /** One letter for the avatar. */
  initial: z.string().nullable(),
  hasApiKey: z.boolean(),
  error: z.string().nullable(),
});
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const ModelInfoSchema = z.object({
  value: z.string(),
  displayName: z.string(),
  description: z.string(),
  efforts: z.array(z.string()),
  defaultEffort: z.string().nullable(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
