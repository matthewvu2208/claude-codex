import type { AgentId } from '../../../shared/agents';
import type { ModelInfo } from '../../../shared/events';
import type { Folder } from '../../../shared/models';
import type { AgentSettings } from '../common/AgentControls';
import { AgentCards } from './AgentCards';
import { useState } from 'react';
import type { AccountStatus } from '../../../shared/events';
import { AgentSetupNotice, agentReady } from '../common/AgentSetupNotice';
import { CommandBox } from './CommandBox';

interface WelcomeProps {
  plans: Record<AgentId, string | null>;
  agent: AgentId;
  onAgentChange: (agent: AgentId) => void;
  folder: Folder | null;
  onChooseFolder: (at: { x: number; y: number }) => void;
  models: ModelInfo[] | undefined;
  settings: AgentSettings;
  onSettingsChange: (patch: Partial<AgentSettings>) => void;
  account: AccountStatus | undefined;
  onRecheckAccount: () => void;
  onOpenAccounts: () => void;
  onStart: (
    opts: {
      agent: AgentId;
      text: string;
      worktree: boolean;
      attachments: string[];
    } & AgentSettings,
  ) => void;
}

/** Labels shown before an agent's model list has loaded. */
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
  models,
  settings,
  onSettingsChange,
  account,
  onRecheckAccount,
  onOpenAccounts,
  onStart,
}: WelcomeProps) {
  const [tried, setTried] = useState(false);
  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-9 overflow-y-auto px-8 py-14">
      <h1 className="m-0 text-center text-[44px] leading-[1.2] font-semibold">
        What should we build?
      </h1>
      <AgentCards value={agent} plans={plans} onChange={onAgentChange} />
      <div className="flex w-full max-w-[1080px] flex-col gap-3.5">
        <AgentSetupNotice
          key={agent}
          agent={agent}
          status={account}
          emphasize={tried}
          onRecheck={onRecheckAccount}
          onOpenAccounts={onOpenAccounts}
        />
        <CommandBox
          key={agent}
          agent={agent}
          folderId={folder?.id ?? null}
          folderName={folder?.name ?? null}
          onChooseFolder={onChooseFolder}
          models={models}
          settings={settings}
          fallbackModelLabel={DEFAULT_MODEL[agent].label}
          onSettingsChange={onSettingsChange}
          worktreeAvailable={folder?.isGitRepo ?? false}
          onStart={(t) => {
            // Not signed in yet: keep the message and point at the sign-in notice.
            if (account && !agentReady(account)) {
              setTried(true);
              return;
            }
            // Fill in the model's own defaults when none was chosen.
            const model = settings.model ?? models?.[0]?.value ?? null;
            const effort =
              settings.effort ?? models?.find((m) => m.value === model)?.defaultEffort ?? null;
            onStart({ agent, ...t, model, effort, permission: settings.permission });
          }}
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
