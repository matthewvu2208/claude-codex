/** Ordered schema migrations; `PRAGMA user_version` records how many have run. */
export const migrations: readonly string[] = [
  `
  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    last_opened_at INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
    native_id TEXT,
    title TEXT NOT NULL,
    cwd TEXT NOT NULL,
    worktree_path TEXT,
    branch TEXT,
    model TEXT,
    effort TEXT,
    permission TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    archived_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_folder ON sessions(folder_id, updated_at DESC);
  CREATE INDEX sessions_parent ON sessions(parent_id);

  CREATE TABLE events (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
  ) WITHOUT ROWID;

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
