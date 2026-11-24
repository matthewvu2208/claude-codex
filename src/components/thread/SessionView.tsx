import { AGENT_LABELS } from '../../../shared/agents';
import type { ModelInfo } from '../../../shared/events';
import type { Session } from '../../../shared/models';
import { api } from '../../lib/ipc';
import type { ThreadState } from '../../lib/thread';
import type { AgentSettings } from '../common/AgentControls';
import { Composer } from './Composer';
import { useState } from 'react';
import type { AccountStatus } from '../../../shared/events';
import { AgentSetupNotice, agentReady } from '../common/AgentSetupNotice';
import { Thread } from './Thread';

interface SessionViewProps {
  session: Session;
  thread: ThreadState;
  models: ModelInfo[] | undefined;
  fallbackModelLabel: string;
  onSettingsChange: (patch: Partial<AgentSettings>) => void;
  resolveSession: (id: string) => Session | undefined;
  onOpenSession: (id: string) => void;
  account: AccountStatus | undefined;
  onRecheckAccount: () => void;
  onOpenAccounts: () => void;
}

export function SessionView({
  session,
  thread,
  models,
  fallbackModelLabel,
  onSettingsChange,
  resolveSession,
  onOpenSession,
  account,
  onRecheckAccount,
  onOpenAccounts,
}: SessionViewProps) {
  const [tried, setTried] = useState(false);
  const ready = !account || agentReady(account);
  const agentLabel = AGENT_LABELS[session.agent];
  return (
    <main className="flex min-w-0 flex-1 flex-col" aria-label={session.title}>
      <Thread
        sessionId={session.id}
        items={thread.items}
        agentLabel={agentLabel}
        resolveSession={resolveSession}
        onOpenSession={onOpenSession}
        onDecide={(requestId, decision) =>
          void api.agent.approve({ sessionId: session.id, requestId, decision })
        }
        footer={
          <div className="flex flex-col gap-2.5">
            <AgentSetupNotice
              agent={session.agent}
              status={account}
              emphasize={tried}
              onRecheck={onRecheckAccount}
              onOpenAccounts={onOpenAccounts}
            />
            <Composer
              key={session.id}
              sessionId={session.id}
              agent={session.agent}
              agentLabel={agentLabel}
              models={models}
              settings={{
                model: session.model,
                effort: session.effort,
                permission: session.permission,
              }}
              fallbackModelLabel={fallbackModelLabel}
              onSettingsChange={onSettingsChange}
              running={thread.running}
              onSend={(text, attachments) =>
                void api.agent
                  .send({ sessionId: session.id, text, attachments })
                  .catch(() => undefined)
              }
              onStop={() => void api.agent.interrupt({ sessionId: session.id })}
              blocked={!ready}
              onBlocked={() => setTried(true)}
            />
          </div>
        }
      />
    </main>
  );
}
