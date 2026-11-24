import type { Permission } from '../../../../shared/agents';
import type {
  AccountStatus,
  AgentEvent,
  ApprovalDecision,
  ModelInfo,
} from '../../../../shared/events';
import type {
  AgentAdapter,
  ApplyResult,
  SlashCommandInfo,
  StartOptions,
  UsageSnapshot,
  UserInput,
} from '../types';
import { CodexEventMapper, fileChangeDetail, fileChangeTitle } from './mapEvents';
import type { AskForApproval } from './protocol/v2/AskForApproval';
import type { GetAccountResponse } from './protocol/v2/GetAccountResponse';
import type { GetAccountRateLimitsResponse } from './protocol/v2/GetAccountRateLimitsResponse';
import type { LoginAccountResponse } from './protocol/v2/LoginAccountResponse';
import type { ModelListResponse } from './protocol/v2/ModelListResponse';
import type { PlanType } from './protocol/PlanType';
import type { RateLimitSnapshot } from './protocol/v2/RateLimitSnapshot';
import type { SandboxMode } from './protocol/v2/SandboxMode';
import type { SandboxPolicy } from './protocol/v2/SandboxPolicy';
import type { ThreadResumeResponse } from './protocol/v2/ThreadResumeResponse';
import type { ThreadStartResponse } from './protocol/v2/ThreadStartResponse';
import type { TurnStartResponse } from './protocol/v2/TurnStartResponse';
import { RpcClient, RpcError, type Transport } from './rpc';

/** Pinned in docs/VERSIONS.md; protocol types are generated from this version. */
export const CODEX_VERSION = '0.171.0';

export const CODEX_PERMISSIONS: Record<
  Permission,
  { approvalPolicy: AskForApproval; sandbox: SandboxMode }
> = {
  ask: { approvalPolicy: 'untrusted', sandbox: 'workspace-write' },
  'auto-edit': { approvalPolicy: 'on-request', sandbox: 'workspace-write' },
  'read-only': { approvalPolicy: 'on-request', sandbox: 'read-only' },
  full: { approvalPolicy: 'never', sandbox: 'danger-full-access' },
};

/** Per-turn sandbox, so a permission change applies from the next turn. */
export function sandboxPolicy(mode: SandboxMode): SandboxPolicy {
  if (mode === 'danger-full-access') return { type: 'dangerFullAccess' };
  if (mode === 'read-only') return { type: 'readOnly', networkAccess: false };
  return {
    type: 'workspaceWrite',
    writableRoots: [],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

const PLAN_LABELS: Partial<Record<PlanType, string>> = {
  free: 'ChatGPT Free',
  go: 'ChatGPT Go',
  plus: 'ChatGPT Plus',
  pro: 'ChatGPT Pro',
  prolite: 'ChatGPT Pro',
  promax: 'ChatGPT Pro',
  team: 'ChatGPT Team',
  business: 'ChatGPT Business',
  enterprise: 'ChatGPT Enterprise',
  edu: 'ChatGPT Edu',
};

export function planLabel(plan: PlanType | null | undefined): string | null {
  if (!plan) return null;
  return PLAN_LABELS[plan] ?? (plan.startsWith('enterprise') ? 'ChatGPT Enterprise' : 'ChatGPT');
}

export interface CodexAdapterDeps {
  /** Starts `codex app-server` (or the test server) and returns its stdio. Null when not installed. */
  connect: () => Transport | null;
  /** Opens OpenAI's sign-in page in the system browser. */
  openExternal: (url: string) => void;
  /** API key from safeStorage, handed to Codex's own apiKey login. Never logged. */
  apiKey?: () => string | null;
  clientVersion?: string;
}

interface Thread {
  sessionId: string;
  threadId: string;
  cwd: string;
  model: string | undefined;
  effort: string | undefined;
  permission: Permission;
  activeTurnId: string | null;
  /** Turns already finished, so a late turn/start response cannot mark one active again. */
  finishedTurns: Set<string>;
  mapper: CodexEventMapper;
}

interface PendingApproval {
  sessionId: string;
  resolve: (decision: string) => void;
}

const DECISIONS: Record<ApprovalDecision, string> = {
  allow: 'accept',
  'allow-session': 'acceptForSession',
  deny: 'decline',
};

/** Codex through `codex app-server`: one process per app run, one thread per session. */
export class CodexAdapter implements AgentAdapter {
  readonly id = 'codex' as const;
  private rpc: RpcClient | null = null;
  private connecting: Promise<RpcClient> | null = null;
  private readonly threads = new Map<string, Thread>();
  private readonly byThreadId = new Map<string, Thread>();
  private readonly approvals = new Map<string, PendingApproval>();
  private readonly listeners = new Set<(e: AgentEvent) => void>();
  private usage: UsageSnapshot | null = null;
  private models: ModelInfo[] | null = null;
  private restarts = 0;
  private stopping = false;

  constructor(private readonly deps: CodexAdapterDeps) {}

  onEvent(cb: (e: AgentEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: AgentEvent) {
    for (const cb of this.listeners) cb(e);
  }

  /** Connects (once), with initialize/initialized and the notification and request handlers. */
  private client(): Promise<RpcClient> {
    if (this.rpc && !this.rpc.isClosed) return Promise.resolve(this.rpc);
    this.connecting ??= (async () => {
      const transport = this.deps.connect();
      if (!transport) throw new Error('The Codex CLI is not installed.');
      const rpc = new RpcClient(transport);
      rpc.onNotification((method, params) => this.onNotification(method, params));
      rpc.onRequest((method, params, id) => this.onServerRequest(method, params, id));
      transport.onClose(() => this.onExit(rpc));
      await rpc.request('initialize', {
        clientInfo: {
          name: 'claude_codex',
          title: 'Claude Codex',
          version: this.deps.clientVersion ?? '0.0.0',
        },
        capabilities: { experimentalApi: true, requestAttestation: false },
      });
      rpc.notify('initialized');
      this.rpc = rpc;
      return rpc;
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  /** The process died: end running turns, then reconnect with backoff and resume open threads. */
  private onExit(rpc: RpcClient) {
    if (this.rpc !== rpc) return;
    this.rpc = null;
    for (const t of this.threads.values()) {
      if (t.activeTurnId) {
        this.emit({
          t: 'error',
          sessionId: t.sessionId,
          message: 'Codex stopped unexpectedly. Reconnecting…',
          retryable: true,
        });
        this.emit({
          t: 'turn.done',
          sessionId: t.sessionId,
          turnId: t.activeTurnId,
          status: 'failed',
          durationMs: 0,
        });
        t.activeTurnId = null;
      }
    }
    for (const [id, a] of this.approvals) {
      this.approvals.delete(id);
      this.emit({
        t: 'approval.resolved',
        sessionId: a.sessionId,
        requestId: id,
        decision: 'cancelled',
      });
    }
    if (this.stopping || this.threads.size === 0) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.restarts++);
    setTimeout(() => void this.reconnect(), delay).unref?.();
  }

  private async reconnect() {
    try {
      const rpc = await this.client();
      for (const t of this.threads.values()) {
        await rpc.request<ThreadResumeResponse>('thread/resume', {
          threadId: t.threadId,
          cwd: t.cwd,
          ...CODEX_PERMISSIONS[t.permission],
          ...(t.model ? { model: t.model } : {}),
        });
      }
      this.restarts = 0;
    } catch {
      // onExit schedules the next attempt if the process dies again.
    }
  }

  private onNotification(method: string, params: Record<string, unknown>) {
    if (method === 'account/rateLimits/updated') {
      this.setUsage((params as { rateLimits: RateLimitSnapshot }).rateLimits);
      return;
    }
    const threadId = typeof params['threadId'] === 'string' ? params['threadId'] : null;
    const thread = threadId ? this.byThreadId.get(threadId) : undefined;
    if (!thread) return;
    if (method === 'turn/started')
      thread.activeTurnId = (params as { turn: { id: string } }).turn.id;
    if (method === 'turn/completed') {
      const id = (params as { turn: { id: string } }).turn.id;
      if (thread.activeTurnId === id) thread.activeTurnId = null;
      thread.finishedTurns.add(id);
      if (thread.finishedTurns.size > 50) {
        thread.finishedTurns.delete(thread.finishedTurns.values().next().value!);
      }
    }
    if (method === 'serverRequest/resolved') {
      const requestId = `codex:${String(params['requestId'])}`;
      const pending = this.approvals.get(requestId);
      if (pending) {
        this.approvals.delete(requestId);
        this.emit({
          t: 'approval.resolved',
          sessionId: pending.sessionId,
          requestId,
          decision: 'cancelled',
        });
      }
      return;
    }
    for (const e of thread.mapper.map(method, params)) this.emit(e);
  }

  private async onServerRequest(
    method: string,
    params: Record<string, unknown>,
    id: number | string,
  ) {
    const threadId = typeof params['threadId'] === 'string' ? params['threadId'] : null;
    const thread = threadId ? this.byThreadId.get(threadId) : undefined;
    const requestId = `codex:${String(id)}`;

    if (method === 'item/commandExecution/requestApproval' && thread) {
      const command = typeof params['command'] === 'string' ? params['command'] : '';
      const decision = await this.ask(thread.sessionId, requestId, {
        kind: 'command',
        title: 'Run a command',
        detail: command,
      });
      return { decision };
    }
    if (method === 'item/fileChange/requestApproval' && thread) {
      const item = thread.mapper.fileChange(String(params['itemId']));
      const decision = await this.ask(thread.sessionId, requestId, {
        kind: 'edit',
        title: item ? fileChangeTitle(item, thread.cwd) : 'Edit files',
        detail: item
          ? fileChangeDetail(item, thread.cwd)
          : typeof params['reason'] === 'string'
            ? params['reason']
            : '',
      });
      return { decision };
    }
    if (method === 'item/tool/call') {
      // Hub tools arrive in M6; until then report that the tool is unavailable.
      return {
        contentItems: [{ type: 'inputText', text: 'This tool is not available.' }],
        success: false,
      };
    }
    // Anything else (token refresh, attestation, elicitation, user input) is declined so turns never hang.
    throw new RpcError(`${method} is not supported by this app`, -32601);
  }

  private ask(
    sessionId: string,
    requestId: string,
    card: { kind: 'command' | 'edit' | 'tool'; title: string; detail: string },
  ): Promise<string> {
    return new Promise((resolve) => {
      this.approvals.set(requestId, { sessionId, resolve });
      this.emit({ t: 'approval.request', sessionId, requestId, ...card });
    });
  }

  private setUsage(r: RateLimitSnapshot | null | undefined) {
    const w = r?.primary;
    if (!w) return;
    this.usage = {
      agent: 'codex',
      percent: Math.round(w.usedPercent),
      window: w.windowDurationMins ? String(w.windowDurationMins) : null,
      resetsAt: w.resetsAt ?? null,
      status: r.rateLimitReachedType ?? null,
    };
  }

  async status(): Promise<AccountStatus> {
    const hasApiKey = !!this.deps.apiKey?.();
    const base: AccountStatus = {
      agent: 'codex',
      installed: true,
      signedIn: false,
      method: null,
      plan: null,
      initial: null,
      hasApiKey,
      error: null,
    };
    let rpc: RpcClient;
    try {
      rpc = await this.client();
    } catch (e) {
      return { ...base, installed: false, error: e instanceof Error ? e.message : String(e) };
    }
    let { account } = await rpc.request<GetAccountResponse>('account/read', {
      refreshToken: false,
    });
    const key = this.deps.apiKey?.();
    if (!account && key) {
      await rpc.request<LoginAccountResponse>('account/login/start', {
        type: 'apiKey',
        apiKey: key,
      });
      ({ account } = await rpc.request<GetAccountResponse>('account/read', {
        refreshToken: false,
      }));
    }
    if (!account) return base;
    if (account.type === 'chatgpt') {
      void rpc
        .request<GetAccountRateLimitsResponse>('account/rateLimits/read', undefined)
        .then((r) => this.setUsage(r.rateLimits))
        .catch(() => undefined);
      return {
        ...base,
        signedIn: true,
        method: 'ChatGPT account',
        plan: planLabel(account.planType),
        initial: account.email ? account.email[0]!.toUpperCase() : null,
      };
    }
    return {
      ...base,
      signedIn: true,
      method: account.type === 'apiKey' ? 'API key' : 'Cloud provider',
      plan: account.type === 'apiKey' ? 'API key' : null,
    };
  }

  /** Starts OpenAI's browser sign-in; Codex receives the result on its own local callback. */
  async signIn(): Promise<void> {
    const rpc = await this.client();
    const res = await rpc.request<LoginAccountResponse>('account/login/start', { type: 'chatgpt' });
    if (res.type === 'chatgpt') this.deps.openExternal(res.authUrl);
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.models) return this.models;
    const rpc = await this.client();
    const res = await rpc.request<ModelListResponse>('model/list', { limit: 100 });
    const visible = res.data
      .filter((m) => !m.hidden)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    this.models = visible.map((m) => ({
      value: m.model,
      displayName: m.displayName,
      description: m.description,
      efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort),
      defaultEffort: m.defaultReasoningEffort,
    }));
    return this.models;
  }

  async readUsage(): Promise<UsageSnapshot | null> {
    return this.usage;
  }

  isRunning(sessionId: string): boolean {
    return !!this.threads.get(sessionId)?.activeTurnId;
  }

  async start(o: StartOptions): Promise<{ nativeId: string }> {
    const existing = this.threads.get(o.sessionId);
    if (existing && this.rpc && !this.rpc.isClosed) return { nativeId: existing.threadId };
    const rpc = await this.client();
    const perms = CODEX_PERMISSIONS[o.permission];
    const res = o.resumeId
      ? await rpc.request<ThreadResumeResponse>('thread/resume', {
          threadId: o.resumeId,
          cwd: o.cwd,
          ...perms,
          ...(o.model ? { model: o.model } : {}),
        })
      : await rpc.request<ThreadStartResponse>('thread/start', {
          cwd: o.cwd,
          ...perms,
          ...(o.model ? { model: o.model } : {}),
        });
    const thread: Thread = {
      sessionId: o.sessionId,
      threadId: res.thread.id,
      cwd: o.cwd,
      model: o.model,
      effort: o.effort,
      permission: o.permission,
      activeTurnId: null,
      finishedTurns: new Set(),
      mapper: new CodexEventMapper(o.sessionId, o.cwd),
    };
    this.threads.set(o.sessionId, thread);
    this.byThreadId.set(thread.threadId, thread);
    return { nativeId: thread.threadId };
  }

  async send(sessionId: string, input: UserInput): Promise<void> {
    const thread = this.threads.get(sessionId);
    if (!thread) throw new Error('Session is not running');
    const rpc = await this.client();
    const items = [{ type: 'text' as const, text: input.text, text_elements: [] }];
    if (thread.activeTurnId) {
      await rpc.request('turn/steer', {
        threadId: thread.threadId,
        input: items,
        expectedTurnId: thread.activeTurnId,
      });
      return;
    }
    const res = await rpc.request<TurnStartResponse>('turn/start', {
      threadId: thread.threadId,
      input: items,
      ...(thread.model ? { model: thread.model } : {}),
      ...(thread.effort ? { effort: thread.effort } : {}),
      approvalPolicy: CODEX_PERMISSIONS[thread.permission].approvalPolicy,
      sandboxPolicy: sandboxPolicy(CODEX_PERMISSIONS[thread.permission].sandbox),
    });
    // turn/started may already have arrived; either way the turn is now active.
    if (
      !thread.activeTurnId &&
      res.turn.status === 'inProgress' &&
      !thread.finishedTurns.has(res.turn.id)
    ) {
      thread.activeTurnId = res.turn.id;
    }
  }

  async interrupt(sessionId: string): Promise<void> {
    const thread = this.threads.get(sessionId);
    if (!thread?.activeTurnId) return;
    for (const [id, a] of this.approvals) {
      if (a.sessionId !== sessionId) continue;
      this.approvals.delete(id);
      a.resolve('cancel');
      this.emit({ t: 'approval.resolved', sessionId, requestId: id, decision: 'cancelled' });
    }
    const rpc = await this.client();
    await rpc.request('turn/interrupt', { threadId: thread.threadId, turnId: thread.activeTurnId });
  }

  async respondApproval(requestId: string, d: ApprovalDecision): Promise<void> {
    const pending = this.approvals.get(requestId);
    if (!pending) return;
    this.approvals.delete(requestId);
    pending.resolve(DECISIONS[d]);
    this.emit({ t: 'approval.resolved', sessionId: pending.sessionId, requestId, decision: d });
  }

  // Model, effort and permission are sent with every turn/start, so changes apply next turn.
  async setModel(sessionId: string, model: string): Promise<ApplyResult> {
    const thread = this.threads.get(sessionId);
    if (thread) thread.model = model;
    return 'applied';
  }

  async setEffort(sessionId: string, effort: string): Promise<ApplyResult> {
    const thread = this.threads.get(sessionId);
    if (thread) thread.effort = effort;
    return 'applied';
  }

  async setPermission(sessionId: string, permission: Permission): Promise<ApplyResult> {
    const thread = this.threads.get(sessionId);
    if (thread) thread.permission = permission;
    return 'applied';
  }

  async listCommands(): Promise<SlashCommandInfo[]> {
    return [];
  }

  async close(sessionId: string): Promise<void> {
    const thread = this.threads.get(sessionId);
    if (!thread) return;
    this.threads.delete(sessionId);
    this.byThreadId.delete(thread.threadId);
  }

  async closeAll(): Promise<void> {
    this.stopping = true;
    this.threads.clear();
    this.byThreadId.clear();
    this.rpc?.close();
    this.rpc = null;
  }
}
