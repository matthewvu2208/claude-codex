import { useState } from 'react';
import type { AgentId, Permission } from '../../../shared/agents';
import type { Folder } from '../../../shared/models';
import { AgentCards } from './AgentCards';
import { CommandBox } from './CommandBox';

interface WelcomeProps {
  plans: Record<AgentId, string | null>;
  agent: AgentId;
  onAgentChange: (agent: AgentId) => void;
  folder: Folder | null;
  onChooseFolder: (at: { x: number; y: number }) => void;
  onStart: (opts: {
    agent: AgentId;
    text: string;
    worktree: boolean;
    model: string | null;
    effort: string;
    permission: Permission;
  }) => void;
}

/** Fixture defaults until M5 wires the model list per agent. */
export const DEFAULT_MODEL: Record<AgentId, { value: string | null; label: string }> = {
  claude: { value: 'opus', label: 'Opus 5.5' },
  codex: { value: null, label: 'Default model' },
};

export function Welcome({
  plans,
  agent,
  onAgentChange,
  folder,
  onChooseFolder,
  onStart,
}: WelcomeProps) {
  const [permission] = useState<Permission>('ask');
  const effort = 'low';

  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-9 overflow-y-auto px-8 py-14">
      <h1 className="m-0 text-center text-[44px] leading-[1.2] font-semibold">
        What should we build?
      </h1>
      <AgentCards value={agent} plans={plans} onChange={onAgentChange} />
      <div className="flex w-full max-w-[1080px] flex-col gap-3.5">
        <CommandBox
          folderName={folder?.name ?? null}
          onChooseFolder={onChooseFolder}
          model={DEFAULT_MODEL[agent].label}
          effort="Low"
          permission={permission}
          worktreeAvailable={folder?.isGitRepo ?? false}
          onStart={(t) =>
            onStart({ agent, ...t, model: DEFAULT_MODEL[agent].value, effort, permission })
          }
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
