// ─── Granularity Levels ───────────────────────────────────
// project  → _project.md      (1 per repo)
// module   → _module.md       (1 per directory)
// file     → <name>.md        (1 per source file)
// timeline → _timeline.md     (1 per repo, append-only)

export interface Frontmatter {
  type: "project" | "module" | "file";
  path: string;
  updated: string;           // ISO timestamp
  git_hash: string | null;
  [key: string]: unknown;    // extensible
}

export interface FileMeta extends Frontmatter {
  type: "file";
  language: string | null;
  size: number;
  symbols: string[];
  dependencies: string[];
}

export interface ModuleMeta extends Frontmatter {
  type: "module";
  file_count: number;
  children: string[];        // sub-directory names
  key_exports: string[];
}

export interface ProjectMeta extends Frontmatter {
  type: "project";
  languages: string[];
  total_files: number;
  total_modules: number;
}

export interface FreshnessResult {
  path: string;
  isStale: boolean;
  indexedAt: string | null;
  currentHash: string | null;
  indexedHash: string | null;
  changedFiles: string[];
}

export interface TimelineEntry {
  timestamp: string;
  action: "create" | "modify" | "delete" | "rename" | "index";
  path: string;
  summary: string;
  author: string | null;
  git_hash: string | null;
}
