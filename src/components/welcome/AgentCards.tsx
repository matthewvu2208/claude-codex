import { Check } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { AGENT_IDS, AGENT_LABELS, type AgentId } from '../../../shared/agents';
import { AgentIcon } from '../common/AgentIcon';

interface AgentCardsProps {
  value: AgentId;
  plans: Record<AgentId, string | null>;
  onChange: (agent: AgentId) => void;
}

/** Radio group of agent cards; arrow keys move the choice, Tab enters only the checked card. */
export function AgentCards({ value, plans, onChange }: AgentCardsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = AGENT_IDS.indexOf(value);
    const next = AGENT_IDS[(i + step + AGENT_IDS.length) % AGENT_IDS.length]!;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Agent"
      className="flex flex-wrap justify-center gap-[18px]"
      onKeyDown={onKeyDown}
    >
      {AGENT_IDS.map((id) => {
        const selected = id === value;
        const plan = plans[id];
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={`relative flex size-[236px] flex-col items-center justify-center gap-3 rounded-[20px] ${
              selected
                ? 'border-[1.5px] border-border-strong bg-card-selected'
                : 'border border-border bg-transparent hover:bg-control'
            }`}
          >
            {selected ? (
              <Check
                size={17}
                strokeWidth={2.2}
                className="absolute top-3 right-3 text-row"
                aria-hidden
              />
            ) : null}
            <AgentIcon agent={id} size={56} />
            <span className="text-[19px] text-primary">{AGENT_LABELS[id]}</span>
            <span className="text-[15px] text-secondary">{plan ?? 'Sign in'}</span>
          </button>
        );
      })}
    </div>
  );
}
