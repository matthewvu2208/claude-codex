import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../../electron/main/store/db';
import { migrations } from '../../electron/main/store/migrations';
import {
  createStore,
  recoverInterruptedTurns,
  type Store,
} from '../../electron/main/store/repositories';

let store: Store;
let folderId: string;

beforeEach(() => {
  store = createStore(openDatabase(':memory:'));
  folderId = store.folders.upsert('/work/app', 'app').id;
});

const newSession = (title: string, parentId: string | null = null) =>
  store.sessions.create({
    folderId,
    agent: 'claude',
    title,
    cwd: '/work/app',
    permission: 'ask',
    parentId,
  });

describe('migrations', () => {
  it('records the schema version and is idempotent', () => {
    expect(store.db.pragma('user_version', { simple: true })).toBe(migrations.length);
    expect(migrate(store.db)).toBe(migrations.length);
  });

  it('refuses a database from a newer app', () => {
    store.db.pragma(`user_version = ${migrations.length + 1}`);
    expect(() => migrate(store.db)).toThrow(/newer/);
  });
});

describe('FoldersRepo', () => {
  it('upserts by path and orders by last opened', () => {
    const again = store.folders.upsert('/work/app', 'app');
    expect(again.id).toBe(folderId);
    const other = store.folders.upsert('/work/other', 'other');
    store.db.prepare('UPDATE folders SET last_opened_at = 1 WHERE id = ?').run(folderId);
    expect(store.folders.list().map((f) => f.id)).toEqual([other.id, folderId]);
    store.folders.touch(folderId);
    expect(store.folders.list()[0]!.id).toBe(folderId);
  });
});

describe('SessionsRepo', () => {
  it('creates a session with defaults', () => {
    const s = newSession('Fix the build');
    expect(s).toMatchObject({
      title: 'Fix the build',
      status: 'idle',
      archived: false,
      parentId: null,
      nativeId: null,
    });
    expect(store.sessions.list().map((x) => x.id)).toEqual([s.id]);
  });

  it('renames without bumping updatedAt', () => {
    const s = newSession('old');
    const renamed = store.sessions.rename(s.id, 'new');
    expect(renamed.title).toBe('new');
    expect(renamed.updatedAt).toBe(s.updatedAt);
    expect(() => store.sessions.rename('missing', 'x')).toThrow();
  });

  it('archives a session and hides its sub-sessions', () => {
    const parent = newSession('parent');
    const child = newSession('child', parent.id);
    const grandchild = newSession('grandchild', child.id);
    const other = newSession('other');
    expect(store.sessions.depth(grandchild.id)).toBe(2);
    store.sessions.archive(parent.id);
    expect(store.sessions.list().map((x) => x.id)).toEqual([other.id]);
    expect(store.sessions.get(parent.id)!.archived).toBe(true);
  });

  it('patches fields', () => {
    const s = newSession('x');
    const u = store.sessions.update(s.id, { nativeId: 'abc', status: 'running', model: 'm' });
    expect(u).toMatchObject({ nativeId: 'abc', status: 'running', model: 'm' });
  });
});

describe('EventsRepo', () => {
  it('appends with increasing seq per session and round-trips JSON', () => {
    const a = newSession('a');
    const b = newSession('b');
    store.events.append(a.id, 'user.message', { text: 'hi' });
    store.events.append(a.id, 'text.done', { text: 'hello' });
    store.events.append(b.id, 'user.message', { text: 'other' });
    const list = store.events.list(a.id);
    expect(list.map((e) => e.seq)).toEqual([1, 2]);
    expect(list[1]!.payload).toEqual({ text: 'hello' });
    expect(store.events.list(a.id, 1)).toHaveLength(1);
  });

  it('deletes events with their session', () => {
    const a = newSession('a');
    store.events.append(a.id, 'x', null);
    store.db.prepare('DELETE FROM sessions WHERE id = ?').run(a.id);
    expect(store.events.list(a.id)).toEqual([]);
  });
});

describe('recoverInterruptedTurns', () => {
  it('closes a turn left open by a crash and resets running sessions', () => {
    const open = newSession('open');
    const done = newSession('done');
    store.events.append(open.id, 'turn.started', { turnId: 'A' });
    store.events.append(open.id, 'text.done', { itemId: 'x', text: 'half' });
    store.sessions.update(open.id, { status: 'running' });
    store.events.append(done.id, 'turn.started', { turnId: 'B' });
    store.events.append(done.id, 'turn.done', { turnId: 'B', status: 'completed', durationMs: 1 });
    expect(store.events.openTurn(open.id)).toBe('A');
    expect(store.events.openTurn(done.id)).toBeNull();

    recoverInterruptedTurns(store);
    expect(store.events.openTurn(open.id)).toBeNull();
    expect(store.events.list(open.id).at(-1)).toMatchObject({
      type: 'turn.done',
      payload: { turnId: 'A', status: 'interrupted' },
    });
    expect(store.events.list(done.id)).toHaveLength(2);
    expect(store.sessions.get(open.id)!.status).toBe('idle');
  });
});

describe('SettingsRepo', () => {
  it('stores JSON values and deletes undefined', () => {
    store.settings.set('lastAgent', 'codex');
    expect(store.settings.all()).toEqual({ lastAgent: 'codex' });
    store.settings.set('lastAgent', undefined);
    expect(store.settings.all()).toEqual({});
  });
});
