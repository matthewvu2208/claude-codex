import type { FixtureUsage } from '../../fixtures/sidebar';
import { AgentIcon } from '../common/AgentIcon';

function Bar({ percent, className }: { percent: number; className?: string }) {
  return (
    <span className={`block h-[5px] rounded-[3px] bg-border ${className ?? ''}`}>
      <span className="block h-[5px] rounded-[3px] bg-secondary" style={{ width: `${percent}%` }} />
    </span>
  );
}

export function UsageCard({ usage }: { usage: FixtureUsage }) {
  return (
    <section
      aria-label="Usage"
      className="flex flex-col gap-2 rounded-xl border border-border bg-control px-3.5 py-3"
    >
      <div className="flex items-center gap-2 text-[14px] text-label">
        <AgentIcon agent="claude" size={15} />
        Claude usage
      </div>
      <div className="flex items-baseline gap-2 text-[14px]">
        <span className="flex-1">{usage.claude.label}</span>
        <span>{usage.claude.percent}%</span>
        <span className="text-[13px] text-muted">· resets {usage.claude.resets}</span>
      </div>
      <Bar percent={usage.claude.percent} />
      <div className="mt-2 flex items-center gap-2.5 text-[14px]">
        <AgentIcon agent="codex" size={16} />
        <span className="text-label">Codex</span>
        <span>{usage.codex.percent}%</span>
        <Bar percent={usage.codex.percent} className="flex-1" />
        <span className="text-[13px] text-muted">{usage.codex.resets}</span>
      </div>
    </section>
  );
}
