import { Asterisk, Cloud } from 'lucide-react';
import type { AgentId } from '../../../shared/agents';

interface AgentIconProps {
  agent: AgentId;
  /** Icon box size in px. */
  size?: number;
  /** Shows a dot in this agent's color at the bottom-right (sub-session on the other agent). */
  dot?: AgentId | null;
  /** Background behind the dot, so it reads as cut out of the icon. */
  dotRing?: string;
  className?: string;
}

const DOT_COLOR: Record<AgentId, string> = {
  claude: 'var(--accent-claude)',
  codex: 'var(--accent-codex)',
};

/**
 * The only place agent icons are drawn. Lucide placeholders until official assets are cleared:
 * Claude = Asterisk in accent.claude, Codex = Cloud in accent.codex with a 22% fill.
 */
export function AgentIcon({
  agent,
  size = 18,
  dot,
  dotRing = 'var(--bg-sidebar)',
  className,
}: AgentIconProps) {
  const icon =
    agent === 'claude' ? (
      <Asterisk
        size={size}
        strokeWidth={size >= 40 ? 2 : 2.4}
        color="var(--accent-claude)"
        aria-hidden
      />
    ) : (
      <Cloud
        size={size}
        strokeWidth={size >= 40 ? 1.6 : 2}
        color="var(--accent-codex)"
        fill="var(--accent-codex-fill)"
        aria-hidden
      />
    );
  return (
    <span
      className={`relative inline-flex flex-none items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
      data-agent={agent}
      data-dot={dot ?? undefined}
    >
      {icon}
      {dot ? (
        <span
          aria-hidden
          className="absolute -right-[3px] -bottom-[3px] box-content size-2 rounded-full border-2"
          style={{ background: DOT_COLOR[dot], borderColor: dotRing }}
        />
      ) : null}
    </span>
  );
}
