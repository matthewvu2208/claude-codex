import { beforeEach, describe, expect, it } from 'vitest';
import { AgentHub } from '../../electron/main/agents/hub';
import type { AgentAdapter } from '../../electron/main/agents/types';
import { SecretStore, type Cipher } from '../../electron/main/services/secrets';
import { openDatabase } from '../../electron/main/store/db';
import { createStore, type Store } from '../../electron/main/store/repositories';
import type { AgentEvent, EventEnvelope } from '../../shared/events';

/** A minimal adapter that records calls and lets the test emit events. */
function stubAdapter() {
  const listeners = new Set<(e: AgentEvent) => void>();
  const calls: string[] = [];
  let running = false;
  const adapter: AgentAdapter = {
    id: 'claude',
    status: async () => ({
      agent: 'claude',
      installed: true,
      signedIn: true,
      method: null,
      plan: null,
      initial: null,
      hasApiKey: false,
      error: null,
    }),
    start: async (o) => {
      calls.push(`start:${o.resumeId ?? 'new'}`);
      return { nativeId: o.resumeId ?? 'native-1' };
    },
    send: async (id, input) => {
      calls.push(`send:${input.text}`);
      running = true;
      for (const l of listeners) l({ t: 'turn.started', sessionId: id, turnId: 'T' });
    },
    interrupt: async () => void calls.push('interrupt'),
    respondApproval: async (r, d) => void calls.push(`approve:${r}:${d}`),
    setModel: async () => undefined,
    setPermission: async () => undefined,
    listModels: async () => [],
    readUsage: async () => null,
    isRunning: () => running,
    close: async () => void calls.push('close'),
    onEvent: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const emit = (e: AgentEvent) => {
    if (e.t === 'turn.done') running = false;
    for (const l of listeners) l(e);
  };
  return { adapter, calls, emit };
}

let store: Store;
let sessionId: string;

beforeEach(() => {
  store = createStore(openDatabase(':memory:'));
  const folder = store.folders.upsert('/w', 'w');
  sessionId = store.sessions.create({
    folderId: folder.id,
    agent: 'claude',
    title: 't',
    cwd: '/w',
    permission: 'ask',
  }).id;
});

describe('AgentHub', () => {
  it('starts lazily, stores the native id, persists the render log and batches events', async () => {
    const { adapter, calls, emit } = stubAdapter();
    const batches: EventEnvelope[][] = [];
    const hub = new AgentHub({
      store,
      adapters: { claude: adapter },
      sink: (b) => batches.push(b),
      batchMs: 1,
    });

    await hub.send(sessionId, 'hello');
    expect(calls).toEqual(['start:new', 'send:hello']);
    expect(store.sessions.get(sessionId)!.nativeId).toBe('native-1');
    expect(store.sessions.get(sessionId)!.status).toBe('running');

    emit({ t: 'text.delta', sessionId, itemId: 'x', text: 'Hi' });
    emit({ t: 'text.done', sessionId, itemId: 'x', text: 'Hi' });
    emit({ t: 'turn.done', sessionId, turnId: 'T', status: 'completed', durationMs: 5 });
    hub.flush();

    const all = batches.flat();
    expect(all.map((b) => b.e.t)).toEqual([
      'user.message',
      'turn.started',
      'session.status',
      'text.delta',
      'text.done',
      'turn.done',
      'session.status',
    ]);
    // Deltas and status changes are live-only; the rest is stored with a seq.
    expect(all.find((b) => b.e.t === 'text.delta')!.seq).toBeNull();
    expect(store.events.list(sessionId).map((e) => e.type)).toEqual([
      'user.message',
      'turn.started',
      'text.done',
      'turn.done',
    ]);
    expect(store.sessions.get(sessionId)!.status).toBe('idle');
  });

  it('resumes with the stored native id after a restart', async () => {
    store.sessions.update(sessionId, { nativeId: 'abc' });
    const { adapter, calls } = stubAdapter();
    const hub = new AgentHub({ store, adapters: { claude: adapter }, sink: () => undefined });
    await hub.send(sessionId, 'again');
    expect(calls[0]).toBe('start:abc');
  });

  it('marks a waiting approval and notifies', async () => {
    const { adapter, emit } = stubAdapter();
    const notes: string[] = [];
    const hub = new AgentHub({
      store,
      adapters: { claude: adapter },
      sink: () => undefined,
      notify: (_s, title) => notes.push(title),
    });
    await hub.send(sessionId, 'x');
    emit({
      t: 'approval.request',
      sessionId,
      requestId: 'r',
      kind: 'command',
      title: 'Run a command',
      detail: 'ls',
    });
    expect(store.sessions.get(sessionId)!.status).toBe('waiting');
    expect(notes).toEqual(['t needs approval']);
    await hub.approve(sessionId, 'r', 'deny');
  });

  it('records an error when the agent is not available', async () => {
    const hub = new AgentHub({ store, adapters: {}, sink: () => undefined });
    await expect(hub.send(sessionId, 'x')).rejects.toThrow(/not available/);
    expect(store.events.list(sessionId).map((e) => e.type)).toEqual(['user.message', 'error']);
  });
});

describe('SecretStore', () => {
  const cipher: Cipher = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from([...s].reverse().join('')),
    decryptString: (b) => [...b.toString()].reverse().join(''),
  };

  it('stores keys encrypted, never in plain text', () => {
    const secrets = new SecretStore(store.settings, cipher);
    secrets.set('anthropic-api-key', 'sk-ant-secret');
    expect(JSON.stringify(store.settings.all())).not.toContain('sk-ant-secret');
    expect(secrets.get('anthropic-api-key')).toBe('sk-ant-secret');
    expect(secrets.has('anthropic-api-key')).toBe(true);
    secrets.set('anthropic-api-key', null);
    expect(secrets.has('anthropic-api-key')).toBe(false);
  });

  it('refuses to store without OS encryption', () => {
    const secrets = new SecretStore(store.settings, {
      ...cipher,
      isEncryptionAvailable: () => false,
    });
    expect(() => secrets.set('k', 'v')).toThrow(/Secure storage/);
  });
});
