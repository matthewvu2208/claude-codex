import { create } from 'zustand';
import { AgentEventSchema, type AgentEvent, type EventEnvelope } from '../../shared/events';
import type { StoredEvent } from '../../shared/models';
import { api } from '../lib/ipc';

interface SessionLog {
  loaded: boolean;
  envelopes: EventEnvelope[];
  /** Highest render-log seq already held, so a live copy of a loaded event is skipped. */
  maxSeq: number;
}

interface ThreadsState {
  logs: Record<string, SessionLog>;
  ingest: (batch: EventEnvelope[]) => void;
  load: (sessionId: string) => Promise<void>;
}

/** Stored events may be older payloads without `t`/`sessionId`; rebuild and validate them. */
export function fromStored(s: StoredEvent): AgentEvent | null {
  const payload = (s.payload && typeof s.payload === 'object' ? s.payload : {}) as Record<
    string,
    unknown
  >;
  const parsed = AgentEventSchema.safeParse({ ...payload, t: s.type, sessionId: s.sessionId });
  return parsed.success ? parsed.data : null;
}

/** Merges the stored render log with live events that arrived before or after loading it. */
export function mergeLog(stored: StoredEvent[], live: EventEnvelope[]): EventEnvelope[] {
  const maxSeq = stored.reduce((m, s) => Math.max(m, s.seq), 0);
  const fromLog: EventEnvelope[] = [];
  for (const s of stored) {
    const e = fromStored(s);
    if (e) fromLog.push({ seq: s.seq, e });
  }
  return [...fromLog, ...live.filter((env) => env.seq === null || env.seq > maxSeq)];
}

export const useThreads = create<ThreadsState>((set, get) => ({
  logs: {},

  ingest: (batch) =>
    set((state) => {
      const logs = { ...state.logs };
      for (const env of batch) {
        if (env.e.t === 'session.status') continue;
        const id = env.e.sessionId;
        const log = logs[id] ?? { loaded: false, envelopes: [], maxSeq: 0 };
        if (env.seq !== null && env.seq <= log.maxSeq) continue;
        logs[id] = {
          ...log,
          envelopes: [...log.envelopes, env],
          maxSeq: env.seq !== null ? env.seq : log.maxSeq,
        };
      }
      return { logs };
    }),

  load: async (sessionId) => {
    if (get().logs[sessionId]?.loaded) return;
    const stored = await api.sessions.events({ id: sessionId });
    set((state) => {
      const envelopes = mergeLog(stored, state.logs[sessionId]?.envelopes ?? []);
      const maxSeq = envelopes.reduce((m, env) => Math.max(m, env.seq ?? 0), 0);
      return { logs: { ...state.logs, [sessionId]: { loaded: true, envelopes, maxSeq } } };
    });
  },
}));
