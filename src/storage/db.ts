import Database from "better-sqlite3";
import path from "node:path";
import { initSchema } from "./schema.js";

let _db: Database.Database | null = null;

/**
 * Open (or create) the SQLite database for a given repo root.
 * DB file lives at `<repoRoot>/.memrepo/memory.db`.
 */
export function getDb(repoRoot: string): Database.Database {
  if (_db) return _db;

  const dbDir = path.join(repoRoot, ".memrepo");
  const dbPath = path.join(dbDir, "memory.db");

  // Ensure .memrepo dir exists
  import("node:fs").then((fs) => fs.mkdirSync(dbDir, { recursive: true }));

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
