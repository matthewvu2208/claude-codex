import { AGENT_LABELS } from '../../../shared/agents';
import type { ModelInfo } from '../../../shared/events';
import type { Session } from '../../../shared/models';
import { api } from '../../lib/ipc';
import type { ThreadState } from '../../lib/thread';
import type { AgentSettings } from '../common/AgentControls';
import { Composer } from './Composer';
import { Thread } from './Thread';

interface SessionViewProps {
  session: Session;
  thread: ThreadState;
  models: ModelInfo[] | undefined;
  fallbackModelLabel: string;
  onSettingsChange: (patch: Partial<AgentSettings>) => void;
  resolveSession: (id: string) => Session | undefined;
  onOpenSession: (id: string) => void;
}

export function SessionView({
  session,
  thread,
  models,
  fallbackModelLabel,
  onSettingsChange,
  resolveSession,
  onOpenSession,
}: SessionViewProps) {
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
            onSend={(text) =>
              void api.agent.send({ sessionId: session.id, text }).catch(() => undefined)
            }
            onStop={() => void api.agent.interrupt({ sessionId: session.id })}
          />
        }
      />
    </main>
  );
}
