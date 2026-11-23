import { useEffect, useState } from 'react';
import type { Session, StoredEvent } from '../../../shared/models';
import { api } from '../../lib/ipc';

/** M2 stand-in for the thread: title and the stored render log. The full thread arrives in M3. */
export function SessionView({ session }: { session: Session }) {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  useEffect(() => {
    let live = true;
    void api.sessions.events({ id: session.id }).then((e) => live && setEvents(e));
    return () => {
      live = false;
    };
  }, [session.id]);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 flex-none items-center border-b border-border-subtle px-6">
        <h1 className="m-0 truncate text-[14px] font-normal">{session.title}</h1>
      </header>
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-8 py-6">
        <div className="flex w-full max-w-[760px] flex-col gap-4">
          {events
            .filter((e) => e.type === 'user.message')
            .map((e) => (
              <div
                key={e.seq}
                className="self-end rounded-2xl bg-surface px-4 py-2.5 text-[15px] whitespace-pre-wrap"
              >
                {(e.payload as { text?: string }).text}
              </div>
            ))}
        </div>
      </div>
    </main>
  );
}
