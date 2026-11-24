import { create } from 'zustand';
import { QUOTE_LIMIT, type Quote } from '../lib/quotes';

interface QuotesState {
  bySession: Record<string, Quote[]>;
  /** Adds a quote to a session's composer; false when it already holds the maximum. */
  add: (sessionId: string, quote: Omit<Quote, 'id'>) => boolean;
  remove: (sessionId: string, id: string) => void;
  clear: (sessionId: string) => void;
}

let next = 1;

/** Quotes waiting in each session's composer (select-to-ask). */
export const useQuotes = create<QuotesState>((set, get) => ({
  bySession: {},
  add: (sessionId, quote) => {
    const list = get().bySession[sessionId] ?? [];
    if (list.some((q) => q.text === quote.text)) return true;
    if (list.length >= QUOTE_LIMIT) return false;
    set((s) => ({
      bySession: { ...s.bySession, [sessionId]: [...list, { ...quote, id: `q${next++}` }] },
    }));
    return true;
  },
  remove: (sessionId, id) =>
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: (s.bySession[sessionId] ?? []).filter((q) => q.id !== id),
      },
    })),
  clear: (sessionId) => set((s) => ({ bySession: { ...s.bySession, [sessionId]: [] } })),
}));
