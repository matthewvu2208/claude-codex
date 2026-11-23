import Database from 'better-sqlite3';
import { migrations } from './migrations';

export type Db = Database.Database;

/** Opens (or creates) the app database and brings its schema up to date. */
export function openDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 2000');
  migrate(db);
  return db;
}

export function migrate(db: Db): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > migrations.length) {
    throw new Error(`Database schema ${current} is newer than this app (${migrations.length}).`);
  }
  const run = db.transaction(() => {
    for (let v = current; v < migrations.length; v++) {
      db.exec(migrations[v]!);
      db.pragma(`user_version = ${v + 1}`);
    }
  });
  run();
  return migrations.length;
}
