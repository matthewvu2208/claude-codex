import type { AgentId, Permission } from '../../../shared/agents';
import type {
  AccountStatus,
  AgentEvent,
  ApprovalDecision,
  ModelInfo,
} from '../../../shared/events';

/** Sub-session tools every parent gets (docs/PLAN.md › Cross-agent sub-sessions). Filled in M6. */
export type HubTools = Record<string, never>;

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

export interface UsageSnapshot {
  agent: AgentId;
  /** 0–100 */
  percent: number | null;
  window: string | null;
  resetsAt: number | null;
  status: string | null;
}

export interface AgentAdapter {
  id: AgentId;
  status(): Promise<AccountStatus>;
  start(o: StartOptions): Promise<{ nativeId: string }>;
  send(sessionId: string, input: UserInput): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  respondApproval(requestId: string, d: ApprovalDecision): Promise<void>;
  setModel(sessionId: string, model: string): Promise<void>;
  setPermission(sessionId: string, permission: Permission): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  readUsage(): Promise<UsageSnapshot | null>;
  isRunning(sessionId: string): boolean;
  close(sessionId: string): Promise<void>;
  /** Stops every session and any agent process (app quit). */
  closeAll?(): Promise<void>;
  onEvent(cb: (e: AgentEvent) => void): () => void;
}
