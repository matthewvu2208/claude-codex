import { AGENT_LABELS } from '../../../shared/agents';
import type { Session } from '../../../shared/models';
import { api } from '../../lib/ipc';
import type { ThreadState } from '../../lib/thread';
import { Composer } from './Composer';
import { Thread } from './Thread';

interface SessionViewProps {
  session: Session;
  thread: ThreadState;
  modelLabel: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SessionView({ session, thread, modelLabel }: SessionViewProps) {
  const agentLabel = AGENT_LABELS[session.agent];
  return (
    <main className="flex min-w-0 flex-1 flex-col" aria-label={session.title}>
      <Thread
        items={thread.items}
        agentLabel={agentLabel}
        onDecide={(requestId, decision) =>
          void api.agent.approve({ sessionId: session.id, requestId, decision })
        }
        footer={
          <Composer
            key={session.id}
            agentLabel={agentLabel}
            modelLabel={modelLabel}
            effortLabel={session.effort ? capitalize(session.effort) : 'Default'}
            permission={session.permission}
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
