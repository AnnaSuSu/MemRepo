import type Database from "better-sqlite3";

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      path          TEXT PRIMARY KEY,
      type          TEXT NOT NULL CHECK(type IN ('file', 'directory')),
      language      TEXT,
      summary       TEXT NOT NULL DEFAULT '',
      symbols       TEXT NOT NULL DEFAULT '[]',    -- JSON array
      dependencies  TEXT NOT NULL DEFAULT '[]',    -- JSON array
      last_indexed_at TEXT NOT NULL,
      git_hash      TEXT,
      size          INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS changes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      path      TEXT NOT NULL,
      action    TEXT NOT NULL CHECK(action IN ('create', 'modify', 'delete', 'rename')),
      summary   TEXT NOT NULL DEFAULT '',
      author    TEXT,
      timestamp TEXT NOT NULL,
      git_hash  TEXT
    );

    CREATE TABLE IF NOT EXISTS modules (
      path            TEXT PRIMARY KEY,
      summary         TEXT NOT NULL DEFAULT '',
      file_count      INTEGER NOT NULL DEFAULT 0,
      children        TEXT NOT NULL DEFAULT '[]',   -- JSON array
      key_exports     TEXT NOT NULL DEFAULT '[]',   -- JSON array
      last_updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_changes_path ON changes(path);
    CREATE INDEX IF NOT EXISTS idx_changes_timestamp ON changes(timestamp);
    CREATE INDEX IF NOT EXISTS idx_entries_language ON entries(language);
  `);
}
