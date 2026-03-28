import type Database from "better-sqlite3";
import type { IndexedEntry, ChangeRecord, ModuleSummary } from "../types.js";

export class Repository {
  constructor(private db: Database.Database) {}

  // ─── Entries ────────────────────────────────────────────

  upsertEntry(entry: IndexedEntry): void {
    this.db
      .prepare(
        `INSERT INTO entries (path, type, language, summary, symbols, dependencies, last_indexed_at, git_hash, size)
         VALUES (@path, @type, @language, @summary, @symbols, @dependencies, @lastIndexedAt, @gitHash, @size)
         ON CONFLICT(path) DO UPDATE SET
           type=@type, language=@language, summary=@summary, symbols=@symbols,
           dependencies=@dependencies, last_indexed_at=@lastIndexedAt, git_hash=@gitHash, size=@size`
      )
      .run({
        ...entry,
        symbols: JSON.stringify(entry.symbols),
        dependencies: JSON.stringify(entry.dependencies),
      });
  }

  getEntry(path: string): IndexedEntry | null {
    const row = this.db
      .prepare("SELECT * FROM entries WHERE path = ?")
      .get(path) as any;
    return row ? this.rowToEntry(row) : null;
  }

  getEntriesByPrefix(prefix: string): IndexedEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM entries WHERE path LIKE ? ORDER BY path")
      .all(`${prefix}%`) as any[];
    return rows.map((r) => this.rowToEntry(r));
  }

  deleteEntry(path: string): void {
    this.db.prepare("DELETE FROM entries WHERE path = ?").run(path);
  }

  searchEntries(query: string): IndexedEntry[] {
    const pattern = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM entries
         WHERE summary LIKE @q OR symbols LIKE @q OR path LIKE @q
         ORDER BY
           CASE WHEN path LIKE @q THEN 0
                WHEN symbols LIKE @q THEN 1
                ELSE 2
           END
         LIMIT 30`
      )
      .all({ q: pattern }) as any[];
    return rows.map((r) => this.rowToEntry(r));
  }

  private rowToEntry(row: any): IndexedEntry {
    return {
      path: row.path,
      type: row.type,
      language: row.language,
      summary: row.summary,
      symbols: JSON.parse(row.symbols),
      dependencies: JSON.parse(row.dependencies),
      lastIndexedAt: row.last_indexed_at,
      gitHash: row.git_hash,
      size: row.size,
    };
  }

  // ─── Changes ────────────────────────────────────────────

  recordChange(change: Omit<ChangeRecord, "id">): void {
    this.db
      .prepare(
        `INSERT INTO changes (path, action, summary, author, timestamp, git_hash)
         VALUES (@path, @action, @summary, @author, @timestamp, @gitHash)`
      )
      .run(change);
  }

  getChanges(opts: {
    path?: string;
    since?: string;
    limit?: number;
  }): ChangeRecord[] {
    let sql = "SELECT * FROM changes WHERE 1=1";
    const params: any = {};

    if (opts.path) {
      sql += " AND path LIKE @path";
      params.path = `${opts.path}%`;
    }
    if (opts.since) {
      sql += " AND timestamp >= @since";
      params.since = opts.since;
    }
    sql += " ORDER BY timestamp DESC";
    if (opts.limit) {
      sql += " LIMIT @limit";
      params.limit = opts.limit;
    }

    return this.db.prepare(sql).all(params) as ChangeRecord[];
  }

  // ─── Modules ────────────────────────────────────────────

  upsertModule(mod: ModuleSummary): void {
    this.db
      .prepare(
        `INSERT INTO modules (path, summary, file_count, children, key_exports, last_updated_at)
         VALUES (@path, @summary, @fileCount, @children, @keyExports, @lastUpdatedAt)
         ON CONFLICT(path) DO UPDATE SET
           summary=@summary, file_count=@fileCount, children=@children,
           key_exports=@keyExports, last_updated_at=@lastUpdatedAt`
      )
      .run({
        ...mod,
        children: JSON.stringify(mod.children),
        keyExports: JSON.stringify(mod.keyExports),
      });
  }

  getModule(path: string): ModuleSummary | null {
    const row = this.db
      .prepare("SELECT * FROM modules WHERE path = ?")
      .get(path) as any;
    return row ? this.rowToModule(row) : null;
  }

  private rowToModule(row: any): ModuleSummary {
    return {
      path: row.path,
      summary: row.summary,
      fileCount: row.file_count,
      children: JSON.parse(row.children),
      keyExports: JSON.parse(row.key_exports),
      lastUpdatedAt: row.last_updated_at,
    };
  }

  // ─── Stats ──────────────────────────────────────────────

  getStats(): { totalFiles: number; totalModules: number; totalChanges: number } {
    const files = this.db.prepare("SELECT COUNT(*) as c FROM entries").get() as any;
    const mods = this.db.prepare("SELECT COUNT(*) as c FROM modules").get() as any;
    const changes = this.db.prepare("SELECT COUNT(*) as c FROM changes").get() as any;
    return {
      totalFiles: files.c,
      totalModules: mods.c,
      totalChanges: changes.c,
    };
  }
}
