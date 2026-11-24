import type { HubToolResult } from '../../../shared/hubTools';
import type { UsageSnapshot } from '../../../shared/usage';
import type { AgentId, Permission } from '../../../shared/agents';
import type {
  AccountStatus,
  AgentEvent,
  ApprovalDecision,
  ModelInfo,
} from '../../../shared/events';

/**
 * Sub-session tools every session gets (docs/PLAN.md › Cross-agent sub-sessions), bound to the
 * calling session. Adapters expose the tools in shared/hubTools.ts and route calls here.
 */
export interface HubTools {
  call(name: string, args: unknown): Promise<HubToolResult>;
}

export interface StartOptions {
  sessionId: string; // our id
  cwd: string; // folder or worktree
  model?: string;
  effort?: string; // values come from the agent's model list
  permission: Permission;
  resumeId?: string; // Claude session_id or Codex threadId
  hubTools: HubTools;
}

export interface UserInput {
  text: string;
}

export type ApplyResult = 'applied' | 'restart';

export interface SlashCommandInfo {
  name: string;
  description: string;
}

export type { UsageSnapshot } from '../../../shared/usage';

export interface AgentAdapter {
  id: AgentId;
  status(): Promise<AccountStatus>;
  start(o: StartOptions): Promise<{ nativeId: string }>;
  send(sessionId: string, input: UserInput): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  respondApproval(requestId: string, d: ApprovalDecision): Promise<void>;
  /**
   * Mid-session changes. 'restart' means the change applies once the agent process restarts
   * (the hub does that between turns, resuming the same conversation).
   */
  setModel(sessionId: string, model: string): Promise<ApplyResult>;
  setEffort(sessionId: string, effort: string): Promise<ApplyResult>;
  setPermission(sessionId: string, permission: Permission): Promise<ApplyResult>;
  listCommands(): Promise<SlashCommandInfo[]>;
  listModels(): Promise<ModelInfo[]>;
  readUsage(): Promise<UsageSnapshot | null>;
  /** Plan usage changes; `raw` is the vendor payload (for the opt-in usage log only). */
  onUsage(cb: (usage: UsageSnapshot, raw: unknown) => void): () => void;
  /** Asks the agent for fresh usage when it can be polled (Codex); Claude only reports with replies. */
  refreshUsage?(): Promise<void>;
  isRunning(sessionId: string): boolean;
  close(sessionId: string): Promise<void>;
  /** Stops every session and any agent process (app quit). */
  closeAll?(): Promise<void>;
  onEvent(cb: (e: AgentEvent) => void): () => void;
}
