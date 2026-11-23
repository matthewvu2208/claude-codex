import type { AgentId } from '../../shared/agents';

/**
 * Placeholder usage and account data until the adapters report real values
 * (accounts in M3/M4, usage meters in M9).
 */
export interface FixtureUsage {
  claude: { label: string; percent: number; resets: string };
  codex: { percent: number; resets: string };
}

export const fixtureUsage: FixtureUsage = {
  claude: { label: 'Weekly · all models', percent: 57, resets: '3d' },
  codex: { percent: 10, resets: '27d' },
};

export const fixtureAccounts: { agent: AgentId; initial: string; plan: string }[] = [
  { agent: 'claude', initial: 'M', plan: 'Ultra' },
  { agent: 'codex', initial: 'M', plan: 'ChatGPT Go' },
];
