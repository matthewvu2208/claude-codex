import { useState } from 'react';
import type { AgentId, Permission } from '../../../shared/agents';
import { AgentCards } from './AgentCards';
import { CommandBox } from './CommandBox';

interface WelcomeProps {
  plans: Record<AgentId, string | null>;
  folderName: string;
  onStart: (opts: { agent: AgentId; text: string; worktree: boolean }) => void;
}

/** Fixture defaults until M5 wires the model list per agent. */
const DEFAULT_MODEL: Record<AgentId, string> = { claude: 'Opus 5.5', codex: 'Default model' };

export function Welcome({ plans, folderName, onStart }: WelcomeProps) {
  const [agent, setAgent] = useState<AgentId>('claude');
  const [permission] = useState<Permission>('ask');

  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-9 overflow-y-auto px-8 py-14">
      <h1 className="m-0 text-center text-[44px] leading-[1.2] font-semibold">
        What should we build?
      </h1>
      <AgentCards value={agent} plans={plans} onChange={setAgent} />
      <div className="flex w-full max-w-[1080px] flex-col gap-3.5">
        <CommandBox
          folderName={folderName}
          model={DEFAULT_MODEL[agent]}
          effort="Low"
          permission={permission}
          worktreeAvailable
          onStart={(t) => onStart({ agent, ...t })}
        />
        <div className="flex flex-wrap justify-center gap-9 text-[14px] text-muted">
          <span>
            <span className="font-mono text-label">@</span> reference a file
          </span>
          <span>
            <span className="font-mono text-label">/</span> run a command
          </span>
          <span>
            <span className="font-mono text-label">⇧↵</span> new line
          </span>
        </div>
      </div>
    </main>
  );
}
