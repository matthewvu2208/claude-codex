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

/** How each vendor's own sign-in flow starts: a terminal command, or a browser flow. */
export type SignInTarget =
  { command: () => { command: string; args: string[] } | null } | { browser: () => Promise<void> };

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

  async signIn(agent: AgentId): Promise<void> {
    const target = this.signInTargets[agent];
    if (target && 'browser' in target) return target.browser();
    const cmd = target?.command();
    if (!cmd) throw new Error('Sign-in is not available for this agent yet.');
    openTerminal(cmd.command, cmd.args, homedir());
  }

  async setApiKey(agent: AgentId, key: string | null): Promise<AccountStatus> {
    this.secrets.set(API_KEY_SECRET[agent], key);
    return this.status(agent);
  }
}
