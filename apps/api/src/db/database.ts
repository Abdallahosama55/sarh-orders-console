import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
const MIGRATION_FILE = /^(\d{3})_[\w-]+\.sql$/;

export function openDatabase(file: string, { readonly = false } = {}): Db {
  if (!readonly) mkdirSync(path.dirname(file), { recursive: true });
  // `timeout` is SQLite's busy timeout: a writer waits up to 5 s for another process's lock.
  const db = new Database(file, { readonly, fileMustExist: readonly, timeout: 5_000 });
  if (!readonly) {
    db.pragma('journal_mode = WAL'); // readers never block the writer, and vice versa
    db.pragma('synchronous = FULL'); // an order we answered 201 for must survive a power cut
  }
  db.pragma('foreign_keys = ON');
  return db;
}

/** Applies pending `migrations/NNN_name.sql` files in order, tracked by PRAGMA user_version. */
export function migrate(db: Db): void {
  const applied = db.pragma('user_version', { simple: true }) as number;
  const pending = readdirSync(MIGRATIONS_DIR)
    .map((file) => ({ file, version: Number(MIGRATION_FILE.exec(file)?.[1] ?? Number.NaN) }))
    .filter(({ version }) => Number.isInteger(version) && version > applied)
    .sort((a, b) => a.version - b.version);

  for (const { file, version } of pending) {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}

export function removeDatabaseFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });
}
