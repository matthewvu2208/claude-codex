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
  // The design's usage card, stored as UsageService keeps the last report.
  store.settings.set('usage:claude', {
    agent: 'claude',
    percent: 57,
    window: 'Weekly · all models',
    resetsAt: Date.now() + 3 * 86_400_000,
    status: 'allowed',
    updatedAt: Date.now(),
  });
  store.db.close();
  return { userData, root, ids };
}

/**
 * One session whose render log holds `count` stored events (M10 performance pass): turns
 * with tools, markdown replies with code, usage and the occasional error.
 */
export function seedLongThread(count = 10_000): Seeded & { sessionId: string } {
  const base = mkdtempSync(join(tmpdir(), 'claude-codex-e2e-'));
  const userData = join(base, 'user-data');
  const root = join(base, 'projects');
  const path = join(root, 'long');
  mkdirSync(userData, { recursive: true });
  mkdirSync(path, { recursive: true });
  const store = createStore(openDatabase(join(userData, 'app.db')));
  const folder = store.folders.upsert(path, 'long');
  const s = store.sessions.create({
    folderId: folder.id,
    agent: 'claude',
    title: 'Long thread',
    cwd: path,
    permission: 'ask',
  });
  const add = (type: string, payload: Record<string, unknown>) =>
    store.events.append(s.id, type, payload);
  store.db.transaction(() => {
    let n = 0;
    for (let turn = 0; n < count; turn++) {
      const T = `t${turn}`;
      add('user.message', { text: `Question ${turn}: what does module ${turn % 37} do?` });
      add('turn.started', { turnId: T });
      n += 2;
      for (let k = 0; k < 2 && n < count; k++, n += 2) {
        add('tool.started', {
          itemId: `${T}-tool${k}`,
          kind: k ? 'command' : 'read',
          title: k ? 'Run npm test' : `Read src/module${turn % 37}.ts`,
        });
        add('tool.done', { itemId: `${T}-tool${k}`, ok: true });
      }
      if (n >= count) break;
      add('text.done', {
        itemId: `${T}-text`,
        text:
          `## Answer ${turn}\n\nModule ${turn % 37} parses the **input** and returns a ` +
          `result. Steps:\n\n1. Read the file\n2. Validate it\n3. Write the output\n\n` +
          '```ts\nexport function run(x: number) {\n  return x * 2;\n}\n```\n',
      });
      add('usage', { contextTokens: 1000 + turn, contextMax: 200_000, costUsd: turn / 100 });
      add('turn.done', { turnId: T, status: 'completed', durationMs: 1200 });
      n += 3;
      if (turn % 50 === 49 && n < count) {
        add('error', { message: 'Claude is rate limited. Try again soon.', retryable: true });
        n++;
      }
    }
  })();
  store.settings.set('lastFolderId', folder.id);
  store.db.close();
  return { userData, root, ids: { long: s.id }, sessionId: s.id };
}
