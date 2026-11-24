import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  createSdkMcpServer,
  query as sdkQuery,
  tool,
  type CanUseTool,
  type Options,
  type PermissionMode,
  type PermissionResult,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { Permission } from '../../../../shared/agents';
import { attachedFilesNote } from '../../../../shared/attachments';
import { HUB_TOOL_NAMES, HUB_TOOLS } from '../../../../shared/hubTools';
import { claudeWindowLabel, toMs, utilizationPercent } from '../../../../shared/usage';
import type {
  AccountStatus,
  AgentEvent,
  ApprovalDecision,
  ModelInfo,
} from '../../../../shared/events';
import type {
  AgentAdapter,
  ApplyResult,
  HubTools,
  SlashCommandInfo,
  StartOptions,
  UsageSnapshot,
  UserInput,
} from '../types';
import { AsyncQueue } from '../asyncQueue';
import { bundledClaudeBinary } from './binary';
import { approvalContent, ClaudeEventMapper } from './mapEvents';

/** Lets the scripted test agent call the hub tools it was given (same handlers Claude would). */
export const hubToolsForTest = new WeakMap<object, HubTools>();

/** The three hub tools as an in-process MCP server named "hub" (tools appear as mcp__hub__*). */
export function hubMcpServer(hub: HubTools) {
  return createSdkMcpServer({
    name: 'hub',
    version: '1.0.0',
    tools: HUB_TOOL_NAMES.map((name) =>
      tool(name, HUB_TOOLS[name].description, HUB_TOOLS[name].input.shape, async (args) => {
        const result = await hub.call(name, args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          ...(result.ok ? {} : { isError: true }),
        };
      }),
    ),
  });
}

export const HUB_ALLOWED_TOOLS = HUB_TOOL_NAMES.map((n) => `mcp__hub__${n}`);

export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Query;

export const PERMISSION_MODES: Record<Permission, PermissionMode> = {
  ask: 'default',
  'auto-edit': 'acceptEdits',
  'read-only': 'plan',
  full: 'bypassPermissions',
};

interface PendingApproval {
  sessionId: string;
  resolve: (r: PermissionResult) => void;
  suggestions: Parameters<CanUseTool>[2]['suggestions'];
}

interface Live {
  q: Query;
  input: AsyncQueue<SDKUserMessage>;
  mapper: ClaudeEventMapper;
  nativeId: string;
  permission: Permission;
  activeTurn: { id: string; startedAt: number } | null;
  queuedTurns: string[];
  interrupting: boolean;
  closed: boolean;
}

export interface ClaudeAdapterDeps {
  queryFn?: QueryFn;
  /** Extra environment for the Claude Code process (API key mode). Never logged. */
  env?: () => Record<string, string>;
  /** `claude auth status` replacement for tests. */
  authStatus?: () => Promise<{ loggedIn: boolean; authMethod: string | null }>;
  binaryPath?: string | null;
  /** Folder of attachment copies; Claude may read it like the session folder. */
  attachmentsDir?: string;
}

/** The user message content: text, the attached-files note, and images as image blocks. */
export function userContent(input: UserInput): SDKUserMessage['message']['content'] {
  const files = input.attachments ?? [];
  if (files.length === 0) return input.text;
  const note = attachedFilesNote(files.filter((f) => f.kind === 'file'));
  const text = [input.text.trim(), note].filter(Boolean).join('\n\n');
  const images = files
    .filter((f) => f.kind === 'image')
    .map((f) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: f.mime as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: readFileSync(f.path).toString('base64'),
      },
    }));
  return [...images, ...(text ? [{ type: 'text' as const, text }] : [])];
}

const PLAN_LABELS: Record<string, string> = {
  max: 'Max',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
  free: 'Free',
};

/** Environment for the Claude Code child: the app's env minus markers of a parent Claude Code. */
function childEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && k !== 'CLAUDECODE') env[k] = v;
  return { ...env, ...extra };
}

export class ClaudeAdapter implements AgentAdapter {
  readonly id = 'claude' as const;
  private readonly live = new Map<string, Live>();
  private readonly approvals = new Map<string, PendingApproval>();
  private readonly listeners = new Set<(e: AgentEvent) => void>();
  private readonly queryFn: QueryFn;
  private readonly binary: string | null;
  private lastRateLimit: UsageSnapshot | null = null;
  private readonly usageListeners = new Set<(u: UsageSnapshot, raw: unknown) => void>();
  private modelsCache: ModelInfo[] | null = null;

  constructor(private readonly deps: ClaudeAdapterDeps = {}) {
    this.queryFn = deps.queryFn ?? (sdkQuery as QueryFn);
    this.binary = deps.binaryPath === undefined ? bundledClaudeBinary() : deps.binaryPath;
  }

  get binaryPath(): string | null {
    return this.binary;
  }

  onEvent(cb: (e: AgentEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: AgentEvent) {
    for (const cb of this.listeners) cb(e);
  }

  private baseOptions(): Options {
    return {
      env: childEnv(this.deps.env?.() ?? {}),
      ...(this.binary ? { pathToClaudeCodeExecutable: this.binary } : {}),
      // Claude Code's own stderr is not forwarded: it can echo prompts.
      stderr: () => undefined,
    };
  }

  private authStatus(): Promise<{ loggedIn: boolean; authMethod: string | null }> {
    if (this.deps.authStatus) return this.deps.authStatus();
    const bin = this.binary;
    if (!bin) return Promise.resolve({ loggedIn: false, authMethod: null });
    return new Promise((resolve) => {
      execFile(
        bin,
        ['auth', 'status'],
        {
          env: childEnv(this.deps.env?.() ?? {}),
          timeout: 20_000,
          cwd: homedir(),
          windowsHide: true,
        },
        (_err, stdout) => {
          try {
            const parsed = JSON.parse(stdout) as { loggedIn?: unknown; authMethod?: unknown };
            resolve({
              loggedIn: parsed.loggedIn === true,
              authMethod: typeof parsed.authMethod === 'string' ? parsed.authMethod : null,
            });
          } catch {
            resolve({ loggedIn: false, authMethod: null });
          }
        },
      );
    });
  }

  /** Runs a short-lived query to read account and model info, then closes it. */
  private async probe<T>(fn: (q: Query) => Promise<T>): Promise<T> {
    const input = new AsyncQueue<SDKUserMessage>();
    const q = this.queryFn({
      prompt: input,
      options: { ...this.baseOptions(), cwd: homedir(), settingSources: [] },
    });
    const drain = (async () => {
      try {
        for await (const _ of q) void _;
      } catch {
        // The probe is closed on purpose.
      }
    })();
    try {
      return await Promise.race([
        fn(q),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Claude did not answer in time')), 30_000),
        ),
      ]);
    } finally {
      input.close();
      q.close();
      void drain;
    }
  }

  async status(): Promise<AccountStatus> {
    const hasApiKey = !!this.deps.env?.()['ANTHROPIC_API_KEY'];
    const base: AccountStatus = {
      agent: 'claude',
      installed: this.binary !== null || !!this.deps.queryFn,
      signedIn: false,
      method: null,
      plan: null,
      initial: null,
      hasApiKey,
      error: null,
    };
    if (!base.installed) return { ...base, error: 'Claude Code is not available for this system.' };
    const auth = await this.authStatus();
    if (!auth.loggedIn) return base;
    const method = hasApiKey || auth.authMethod === 'api_key' ? 'API key' : 'Claude account';
    try {
      const info = await this.probe((q) => q.accountInfo());
      const sub = info.subscriptionType?.toLowerCase() ?? '';
      const plan = hasApiKey ? 'API key' : (PLAN_LABELS[sub] ?? info.subscriptionType ?? null);
      return {
        ...base,
        signedIn: true,
        method,
        plan,
        initial: info.email ? info.email[0]!.toUpperCase() : null,
      };
    } catch (e) {
      return { ...base, signedIn: true, method, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.modelsCache) return this.modelsCache;
    const anyLive = [...this.live.values()].find((l) => !l.closed);
    const models = anyLive
      ? await anyLive.q.supportedModels()
      : await this.probe((q) => q.supportedModels());
    this.modelsCache = models.map((m) => ({
      value: m.value,
      displayName: m.displayName,
      description: m.description,
      efforts: m.supportedEffortLevels ?? [],
      defaultEffort: null,
    }));
    return this.modelsCache;
  }

  async readUsage(): Promise<UsageSnapshot | null> {
    return this.lastRateLimit;
  }

  onUsage(cb: (u: UsageSnapshot, raw: unknown) => void): () => void {
    this.usageListeners.add(cb);
    return () => this.usageListeners.delete(cb);
  }

  isRunning(sessionId: string): boolean {
    return !!this.live.get(sessionId)?.activeTurn;
  }

  async start(o: StartOptions): Promise<{ nativeId: string }> {
    const existing = this.live.get(o.sessionId);
    if (existing && !existing.closed) return { nativeId: existing.nativeId };

    const nativeId = o.resumeId ?? randomUUID();
    const input = new AsyncQueue<SDKUserMessage>();
    const canUseTool: CanUseTool = (toolName, toolInput, opts) =>
      new Promise<PermissionResult>((resolve) => {
        const requestId = opts.requestId || randomUUID();
        const content = approvalContent(toolName, toolInput, o.cwd);
        this.approvals.set(requestId, {
          sessionId: o.sessionId,
          resolve,
          suggestions: opts.suggestions,
        });
        opts.signal.addEventListener('abort', () => {
          if (this.approvals.delete(requestId)) {
            this.emit({
              t: 'approval.resolved',
              sessionId: o.sessionId,
              requestId,
              decision: 'cancelled',
            });
            resolve({ behavior: 'deny', message: 'Cancelled' });
          }
        });
        this.emit({ t: 'approval.request', sessionId: o.sessionId, requestId, ...content });
      });

    const options: Options = {
      ...this.baseOptions(),
      cwd: o.cwd,
      ...(this.deps.attachmentsDir ? { additionalDirectories: [this.deps.attachmentsDir] } : {}),
      ...(o.model ? { model: o.model } : {}),
      ...(o.effort ? { effort: o.effort as NonNullable<Options['effort']> } : {}),
      permissionMode: PERMISSION_MODES[o.permission],
      ...(o.permission === 'full' ? { allowDangerouslySkipPermissions: true } : {}),
      canUseTool,
      includePartialMessages: true,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      mcpServers: { hub: hubMcpServer(o.hubTools) },
      // Starting a sub-session needs no approval card; the sub-session's own actions still do.
      allowedTools: HUB_ALLOWED_TOOLS,
      ...(o.resumeId ? { resume: o.resumeId } : { sessionId: nativeId }),
    };
    hubToolsForTest.set(options, o.hubTools);
    const q = this.queryFn({ prompt: input, options });
    const live: Live = {
      q,
      input,
      mapper: new ClaudeEventMapper(o.sessionId, o.cwd),
      nativeId,
      permission: o.permission,
      activeTurn: null,
      queuedTurns: [],
      interrupting: false,
      closed: false,
    };
    this.live.set(o.sessionId, live);
    void this.consume(o.sessionId, live);
    return { nativeId };
  }

  private async consume(sessionId: string, live: Live) {
    try {
      for await (const msg of live.q) this.handle(sessionId, live, msg);
    } catch (e) {
      if (!live.closed) {
        this.emit({
          t: 'error',
          sessionId,
          message: `Claude stopped: ${e instanceof Error ? e.message : String(e)}`,
          retryable: true,
        });
      }
    } finally {
      const wasClosed = live.closed;
      live.closed = true;
      if (live.activeTurn)
        this.finishTurn(
          sessionId,
          live,
          wasClosed ? 'interrupted' : 'failed',
          Date.now() - live.activeTurn.startedAt,
        );
      for (const id of live.queuedTurns)
        this.emit({ t: 'turn.done', sessionId, turnId: id, status: 'failed', durationMs: 0 });
      live.queuedTurns = [];
      this.cancelApprovals(sessionId);
      if (this.live.get(sessionId) === live) this.live.delete(sessionId);
    }
  }

  private handle(sessionId: string, live: Live, msg: SDKMessage) {
    if (msg.type === 'rate_limit_event') {
      const info = msg.rate_limit_info;
      this.lastRateLimit = {
        agent: 'claude',
        percent: utilizationPercent(info.utilization),
        window: claudeWindowLabel(info.rateLimitType),
        resetsAt: toMs(info.resetsAt),
        status: info.status,
        updatedAt: Date.now(),
      };
      for (const cb of this.usageListeners) cb(this.lastRateLimit, info);
      if (info.status === 'rejected' && info.errorCode === 'credits_required') {
        this.emit({
          t: 'error',
          sessionId,
          message: "Your plan's included usage is used up for now.",
          retryable: false,
        });
        void live.q.interrupt().catch(() => undefined);
      }
      return;
    }
    if (msg.type === 'result') {
      const status = live.interrupting
        ? 'interrupted'
        : msg.subtype === 'success' && !msg.is_error
          ? 'completed'
          : 'failed';
      if (status === 'failed' && msg.subtype !== 'success') {
        this.emit({ t: 'error', sessionId, message: resultError(msg.subtype), retryable: true });
      }
      this.emit({ t: 'usage', sessionId, costUsd: msg.total_cost_usd });
      this.finishTurn(sessionId, live, status, msg.duration_ms);
      void live.q
        .getContextUsage()
        .then((u) =>
          this.emit({
            t: 'usage',
            sessionId,
            contextTokens: u.totalTokens,
            contextMax: u.maxTokens,
          }),
        )
        .catch(() => undefined);
      return;
    }
    for (const e of live.mapper.map(msg)) this.emit(e);
  }

  private finishTurn(
    sessionId: string,
    live: Live,
    status: 'completed' | 'interrupted' | 'failed',
    durationMs: number,
  ) {
    const turn = live.activeTurn;
    if (!turn) return;
    live.activeTurn = null;
    live.interrupting = false;
    this.emit({ t: 'turn.done', sessionId, turnId: turn.id, status, durationMs });
    const next = live.queuedTurns.shift();
    if (next) {
      live.activeTurn = { id: next, startedAt: Date.now() };
      this.emit({ t: 'turn.started', sessionId, turnId: next });
    }
  }

  async send(sessionId: string, input: UserInput): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live || live.closed) throw new Error('Session is not running');
    const turnId = randomUUID();
    if (live.activeTurn) live.queuedTurns.push(turnId);
    else {
      live.activeTurn = { id: turnId, startedAt: Date.now() };
      this.emit({ t: 'turn.started', sessionId, turnId });
    }
    live.input.push({
      type: 'user',
      message: { role: 'user', content: userContent(input) },
      parent_tool_use_id: null,
    });
  }

  async interrupt(sessionId: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live?.activeTurn) return;
    live.interrupting = true;
    this.cancelApprovals(sessionId);
    await live.q.interrupt();
  }

  async respondApproval(requestId: string, d: ApprovalDecision): Promise<void> {
    const pending = this.approvals.get(requestId);
    if (!pending) return;
    this.approvals.delete(requestId);
    if (d === 'deny') pending.resolve({ behavior: 'deny', message: 'The user denied this.' });
    else if (d === 'allow-session' && pending.suggestions?.length) {
      pending.resolve({ behavior: 'allow', updatedPermissions: pending.suggestions });
    } else pending.resolve({ behavior: 'allow' });
    this.emit({ t: 'approval.resolved', sessionId: pending.sessionId, requestId, decision: d });
  }

  private cancelApprovals(sessionId: string) {
    for (const [id, p] of this.approvals) {
      if (p.sessionId !== sessionId) continue;
      this.approvals.delete(id);
      p.resolve({ behavior: 'deny', message: 'Cancelled', interrupt: true });
      this.emit({ t: 'approval.resolved', sessionId, requestId: id, decision: 'cancelled' });
    }
  }

  async setModel(sessionId: string, model: string): Promise<ApplyResult> {
    const live = this.live.get(sessionId);
    if (live && !live.closed) await live.q.setModel(model);
    return 'applied';
  }

  /** Effort is fixed when Claude Code starts, so it applies after a restart (same conversation). */
  async setEffort(sessionId: string): Promise<ApplyResult> {
    return this.live.has(sessionId) ? 'restart' : 'applied';
  }

  async setPermission(sessionId: string, permission: Permission): Promise<ApplyResult> {
    const live = this.live.get(sessionId);
    if (!live || live.closed) return 'applied';
    // Skipping permissions has to be allowed when Claude Code starts.
    if (permission === 'full' || live.permission === 'full') return 'restart';
    await live.q.setPermissionMode(PERMISSION_MODES[permission]);
    live.permission = permission;
    return 'applied';
  }

  async listCommands(): Promise<SlashCommandInfo[]> {
    const anyLive = [...this.live.values()].find((l) => !l.closed);
    const commands = anyLive
      ? await anyLive.q.supportedCommands()
      : await this.probe((q) => q.supportedCommands());
    return commands.map((c) => ({ name: c.name, description: c.description }));
  }

  async close(sessionId: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live) return;
    live.closed = true;
    live.input.close();
    live.q.close();
    this.live.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.close(id)));
  }
}

function resultError(subtype: string): string {
  switch (subtype) {
    case 'error_max_turns':
      return 'Claude stopped after too many turns.';
    case 'error_max_budget_usd':
      return 'Claude stopped at the cost limit.';
    default:
      return 'Claude stopped with an error.';
  }
}
