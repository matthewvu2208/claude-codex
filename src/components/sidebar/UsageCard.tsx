import { useEffect, useState } from 'react';
import { formatReset, type UsageSnapshot, type UsageState } from '../../../shared/usage';
import { AgentIcon } from '../common/AgentIcon';

function Bar({ percent, className }: { percent: number | null; className?: string }) {
  return (
    <span className={`block h-[5px] rounded-[3px] bg-border ${className ?? ''}`} aria-hidden>
      {percent !== null ? (
        <span
          className="block h-[5px] rounded-[3px] bg-secondary"
          style={{ width: `${percent}%` }}
        />
      ) : null}
    </span>
  );
}

const UNKNOWN_HINT = {
  claude:
    'Not reported yet. Claude reports plan usage with its replies; it shows here after the next one.',
  codex: 'Not reported yet. Codex reports plan usage once you are signed in with ChatGPT.',
};

function Percent({ u, agent }: { u: UsageSnapshot | null; agent: 'claude' | 'codex' }) {
  if (u?.percent === null || u?.percent === undefined) {
    return (
      <span
        title={UNKNOWN_HINT[agent]}
        aria-label={`${agent === 'claude' ? 'Claude' : 'Codex'} usage unknown`}
      >
        —
      </span>
    );
  }
  return <span>{u.percent}%</span>;
}

/** Sidebar usage card: Claude from rate-limit events, Codex from its rate limits. */
export function UsageCard({ usage }: { usage: UsageState }) {
  // Re-render each minute so "resets 3d" counts down.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const { claude, codex } = usage;
  const claudeReset = formatReset(claude?.resetsAt ?? null, now);
  const codexReset = formatReset(codex?.resetsAt ?? null, now);
  const limited = claude?.status === 'rejected';

  return (
    <section
      aria-label="Usage"
      className="flex flex-col gap-2 rounded-xl border border-border bg-control px-3.5 py-3"
    >
      <div className="flex items-center gap-2 text-[14px] text-label">
        <AgentIcon agent="claude" size={15} />
        Claude usage
      </div>
      <div className="flex items-baseline gap-2 text-[14px]" data-testid="claude-usage">
        <span className="flex-1">{claude?.window ?? 'Plan usage'}</span>
        <Percent u={claude} agent="claude" />
        {claudeReset ? (
          <span className="text-[13px] text-muted">· resets {claudeReset}</span>
        ) : null}
      </div>
      <Bar percent={claude?.percent ?? null} />
      {limited ? (
        <span className="text-[12px] text-attention">
          Limit reached{claudeReset ? `; resets in ${claudeReset}` : ''}
        </span>
      ) : null}
      <div className="mt-2 flex items-center gap-2.5 text-[14px]" data-testid="codex-usage">
        <AgentIcon agent="codex" size={16} />
        <span className="text-label" title={codex?.window ?? undefined}>
          Codex
        </span>
        <Percent u={codex} agent="codex" />
        <Bar percent={codex?.percent ?? null} className="flex-1" />
        <span className="text-[13px] text-muted">{codexReset ?? ''}</span>
      </div>
    </section>
  );
}
