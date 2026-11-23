export const AGENT_IDS = ['claude', 'codex'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const AGENT_LABELS: Record<AgentId, string> = {
  claude: 'Claude',
  codex: 'Codex',
};

export const PERMISSIONS = ['ask', 'auto-edit', 'read-only', 'full'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  ask: 'Ask',
  'auto-edit': 'Auto-edit',
  'read-only': 'Read-only',
  full: 'Full access',
};
