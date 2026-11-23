import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../electron/main/store/db';
import { createStore } from '../../electron/main/store/repositories';
import type { AgentId } from '../../shared/agents';

export interface Seeded {
  userData: string;
  root: string;
  ids: Record<string, string>;
}

type Row = [key: string, agent: AgentId, title: string, parent?: string];

/** The design canvas's sidebar (artboard 1), newest first. */
const DESIGN_SESSIONS: Row[] = [
  ['s1', 'claude', 'Review thư mục với Codex'],
  ['s1a', 'codex', 'Codex review of session_test folder', 's1'],
  ['s2', 'claude', 'Tạo nested session với Codex'],
  ['s3', 'claude', 'Research ai với nested session'],
  ['s3a', 'codex', 'Research về AI', 's3'],
  ['s4', 'claude', 'Nested session về AI'],
  ['s5', 'claude', 'Folder analysis'],
  ['s6', 'claude', '10-line poem in markdown'],
];

/** Creates a throwaway user-data folder whose database holds the design's folders and sessions. */
export function seedDesignData(opts: { empty?: boolean } = {}): Seeded {
  const base = mkdtempSync(join(tmpdir(), 'claude-codex-e2e-'));
  const userData = join(base, 'user-data');
  const root = join(base, 'projects');
  mkdirSync(userData, { recursive: true });
  const ids: Record<string, string> = {};
  if (opts.empty) return { userData, root, ids };

  const store = createStore(openDatabase(join(userData, 'app.db')));
  const folders = ['session_test', 'macbook_debug', 'house design'].map((name) => {
    const path = join(root, name);
    mkdirSync(path, { recursive: true });
    return store.folders.upsert(path, name);
  });
  mkdirSync(join(root, 'session_test', '.git'));
  // Oldest opened first, so the list reads house design, macbook_debug, session_test.
  folders.forEach((f, i) =>
    store.db.prepare('UPDATE folders SET last_opened_at = ? WHERE id = ?').run(1000 + i, f.id),
  );
  const sessionTest = folders[0]!;

  let ts = 100_000;
  for (const [key, agent, title, parent] of DESIGN_SESSIONS) {
    const s = store.sessions.create({
      folderId: sessionTest.id,
      agent,
      title,
      cwd: sessionTest.path,
      parentId: parent ? ids[parent]! : null,
      permission: parent ? 'read-only' : 'ask',
    });
    ids[key] = s.id;
    // Roots newest first; children in start order (after their parent).
    const at = parent ? ts + 50_000 : (ts -= 10);
    store.db
      .prepare('UPDATE sessions SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(at, at, s.id);
  }
  store.settings.set('lastFolderId', sessionTest.id);
  store.db.close();
  return { userData, root, ids };
}
