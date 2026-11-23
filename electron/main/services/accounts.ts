import { homedir } from 'node:os';
import type { AgentId } from '../../../shared/agents';
import type { AccountStatus } from '../../../shared/events';
import type { AgentHub } from '../agents/hub';
import type { SecretStore } from './secrets';
import { openTerminal } from './terminal';

export const API_KEY_SECRET: Record<AgentId, string> = {
  claude: 'anthropic-api-key',
  codex: 'openai-api-key',
};

export interface SignInTarget {
  /** Executable and arguments for the vendor's own sign-in flow. */
  command: () => { command: string; args: string[] } | null;
}

/** Sign-in state per agent. Sign-in always runs in the vendor's own flow. */
export class AccountsService {
  constructor(
    private readonly hub: AgentHub,
    private readonly secrets: SecretStore,
    private readonly signInTargets: Partial<Record<AgentId, SignInTarget>>,
  ) {}

  apiKeyEnv(agent: AgentId, variable: string): Record<string, string> {
    const key = this.secrets.get(API_KEY_SECRET[agent]);
    return key ? { [variable]: key } : {};
  }

  async status(agent: AgentId): Promise<AccountStatus> {
    try {
      return await this.hub.adapter(agent).status();
    } catch (e) {
      return {
        agent,
        installed: false,
        signedIn: false,
        method: null,
        plan: null,
        initial: null,
        hasApiKey: this.secrets.has(API_KEY_SECRET[agent]),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  signIn(agent: AgentId): void {
    const target = this.signInTargets[agent]?.command();
    if (!target) throw new Error('Sign-in is not available for this agent yet.');
    openTerminal(target.command, target.args, homedir());
  }

  async setApiKey(agent: AgentId, key: string | null): Promise<AccountStatus> {
    this.secrets.set(API_KEY_SECRET[agent], key);
    return this.status(agent);
  }
}
