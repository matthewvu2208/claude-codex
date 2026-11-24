import { z } from 'zod';
import { api } from './ipc';

const DataBatch = z.array(z.object({ id: z.string(), data: z.string() }));
const ExitInfo = z.object({ id: z.string(), code: z.number() });

const MAX_BUFFER = 256 * 1024;
const buffers = new Map<string, string>();
const listeners = new Map<string, Set<(data: string) => void>>();
const exited = new Map<string, number>();
const exitListeners = new Set<(id: string, code: number) => void>();

/**
 * Routes terminal output from main to mounted xterm views, keeping recent output so a tab shows
 * its history when it is opened again. `onOutput` lets the rail show the unseen-output dot.
 */
export function startTerminalRouter(onOutput: () => void): () => void {
  const offData = api.pty.onData((raw) => {
    const parsed = DataBatch.safeParse(raw);
    if (!parsed.success) return;
    for (const { id, data } of parsed.data) {
      const next = (buffers.get(id) ?? '') + data;
      buffers.set(id, next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next);
      for (const cb of listeners.get(id) ?? []) cb(data);
    }
    onOutput();
  });
  const offExit = api.pty.onExit((raw) => {
    const parsed = ExitInfo.safeParse(raw);
    if (!parsed.success) return;
    exited.set(parsed.data.id, parsed.data.code);
    for (const cb of exitListeners) cb(parsed.data.id, parsed.data.code);
  });
  return () => {
    offData();
    offExit();
  };
}

export function terminalHistory(id: string): string {
  return buffers.get(id) ?? '';
}

export function onTerminalData(id: string, cb: (data: string) => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(cb);
  listeners.set(id, set);
  return () => set.delete(cb);
}

export function onTerminalExit(cb: (id: string, code: number) => void): () => void {
  exitListeners.add(cb);
  return () => exitListeners.delete(cb);
}

export function exitCode(id: string): number | undefined {
  return exited.get(id);
}
