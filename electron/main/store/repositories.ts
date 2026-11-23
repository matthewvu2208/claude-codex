import { randomUUID } from 'node:crypto';
import type { AgentId, Permission } from '../../../shared/agents';
import type { Session, SessionStatus, StoredEvent } from '../../../shared/models';
import type { Db } from './db';

const now = () => Date.now();

export interface FolderRow {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
}

export class FoldersRepo {
  constructor(private readonly db: Db) {}

  list(): FolderRow[] {
    return this.db
      .prepare(
        'SELECT id, path, name, last_opened_at AS lastOpenedAt FROM folders ORDER BY last_opened_at DESC',
      )
      .all() as FolderRow[];
  }

  get(id: string): FolderRow | undefined {
    return this.db
      .prepare('SELECT id, path, name, last_opened_at AS lastOpenedAt FROM folders WHERE id = ?')
      .get(id) as FolderRow | undefined;
  }

  /** Adds the folder, or marks it as just opened when it already exists. */
  upsert(path: string, name: string): FolderRow {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO folders (id, path, name, last_opened_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET last_opened_at = excluded.last_opened_at, name = excluded.name`,
      )
      .run(randomUUID(), path, name, ts);
    return this.db
      .prepare('SELECT id, path, name, last_opened_at AS lastOpenedAt FROM folders WHERE path = ?')
      .get(path) as FolderRow;
  }

  touch(id: string): void {
    this.db.prepare('UPDATE folders SET last_opened_at = ? WHERE id = ?').run(now(), id);
  }
}

interface SessionDbRow {
  id: string;
  folder_id: string;
  parent_id: string | null;
  agent: AgentId;
  native_id: string | null;
  title: string;
  cwd: string;
  worktree_path: string | null;
  branch: string | null;
  model: string | null;
  effort: string | null;
  permission: Permission;
  status: SessionStatus;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

const toSession = (r: SessionDbRow): Session => ({
  id: r.id,
  folderId: r.folder_id,
  parentId: r.parent_id,
  agent: r.agent,
  nativeId: r.native_id,
  title: r.title,
  cwd: r.cwd,
  worktreePath: r.worktree_path,
  branch: r.branch,
  model: r.model,
  effort: r.effort,
  permission: r.permission,
  status: r.status,
  archived: r.archived_at !== null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface NewSession {
  folderId: string;
  parentId?: string | null;
  agent: AgentId;
  title: string;
  cwd: string;
  worktreePath?: string | null;
  branch?: string | null;
  model?: string | null;
  effort?: string | null;
  permission: Permission;
}

export type SessionPatch = Partial<
  Pick<
    Session,
    'title' | 'nativeId' | 'model' | 'effort' | 'permission' | 'status' | 'worktreePath' | 'branch'
  >
>;

const PATCH_COLUMNS: Record<keyof SessionPatch, string> = {
  title: 'title',
  nativeId: 'native_id',
  model: 'model',
  effort: 'effort',
  permission: 'permission',
  status: 'status',
  worktreePath: 'worktree_path',
  branch: 'branch',
};

export class SessionsRepo {
  constructor(private readonly db: Db) {}

  /** Live sessions (not archived), newest first. Archiving a parent hides its children too. */
  list(): Session[] {
    const rows = this.db
      .prepare(
        `WITH RECURSIVE hidden(id) AS (
           SELECT id FROM sessions WHERE archived_at IS NOT NULL
           UNION SELECT s.id FROM sessions s JOIN hidden h ON s.parent_id = h.id
         )
         SELECT * FROM sessions WHERE id NOT IN (SELECT id FROM hidden) ORDER BY updated_at DESC`,
      )
      .all() as SessionDbRow[];
    return rows.map(toSession);
  }

  get(id: string): Session | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      SessionDbRow | undefined;
    return row ? toSession(row) : undefined;
  }

  create(s: NewSession): Session {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO sessions (id, folder_id, parent_id, agent, title, cwd, worktree_path, branch, model, effort,
           permission, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)`,
      )
      .run(
        id,
        s.folderId,
        s.parentId ?? null,
        s.agent,
        s.title,
        s.cwd,
        s.worktreePath ?? null,
        s.branch ?? null,
        s.model ?? null,
        s.effort ?? null,
        s.permission,
        ts,
        ts,
      );
    return this.get(id)!;
  }

  update(id: string, patch: SessionPatch): Session {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
      keyof SessionPatch,
      unknown,
    ][];
    if (entries.length > 0) {
      const sets = entries.map(([k]) => `${PATCH_COLUMNS[k]} = ?`).join(', ');
      this.db
        .prepare(`UPDATE sessions SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...entries.map(([, v]) => v), now(), id);
    }
    const s = this.get(id);
    if (!s) throw new Error(`No session ${id}`);
    return s;
  }

  rename(id: string, title: string): Session {
    // A rename should not move the session to the top of the list.
    const info = this.db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id);
    if (info.changes === 0) throw new Error(`No session ${id}`);
    return this.get(id)!;
  }

  archive(id: string): void {
    this.db.prepare('UPDATE sessions SET archived_at = ? WHERE id = ?').run(now(), id);
  }

  children(id: string): Session[] {
    return (
      this.db
        .prepare('SELECT * FROM sessions WHERE parent_id = ? ORDER BY created_at')
        .all(id) as SessionDbRow[]
    ).map(toSession);
  }

  depth(id: string): number {
    let depth = 0;
    let cur = this.get(id);
    while (cur?.parentId) {
      depth += 1;
      cur = this.get(cur.parentId);
    }
    return depth;
  }
}

export class EventsRepo {
  constructor(private readonly db: Db) {}

  append(sessionId: string, type: string, payload: unknown): StoredEvent {
    const ts = now();
    const insert = this.db.transaction(() => {
      const { next } = this.db
        .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM events WHERE session_id = ?')
        .get(sessionId) as { next: number };
      this.db
        .prepare('INSERT INTO events (session_id, seq, ts, type, payload) VALUES (?, ?, ?, ?, ?)')
        .run(sessionId, next, ts, type, JSON.stringify(payload ?? null));
      return next;
    });
    const seq = insert();
    return { sessionId, seq, ts, type, payload };
  }

  list(sessionId: string, afterSeq = 0): StoredEvent[] {
    const rows = this.db
      .prepare(
        'SELECT session_id AS sessionId, seq, ts, type, payload FROM events WHERE session_id = ? AND seq > ? ORDER BY seq',
      )
      .all(sessionId, afterSeq) as (Omit<StoredEvent, 'payload'> & { payload: string })[];
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as unknown }));
  }
}

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  all(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
  }

  set(key: string, value: unknown): void {
    if (value === undefined) {
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      return;
    }
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(value));
  }
}

export interface Store {
  db: Db;
  folders: FoldersRepo;
  sessions: SessionsRepo;
  events: EventsRepo;
  settings: SettingsRepo;
}

export function createStore(db: Db): Store {
  return {
    db,
    folders: new FoldersRepo(db),
    sessions: new SessionsRepo(db),
    events: new EventsRepo(db),
    settings: new SettingsRepo(db),
  };
}
