/** A file or directory that has been indexed */
export interface IndexedEntry {
  path: string;
  type: "file" | "directory";
  language: string | null;
  summary: string;
  symbols: string[];          // exported functions, classes, types
  dependencies: string[];     // import paths
  lastIndexedAt: string;      // ISO timestamp
  gitHash: string | null;     // commit hash at time of indexing
  size: number;               // file size in bytes
}

/** A recorded change event */
export interface ChangeRecord {
  id: number;
  path: string;
  action: "create" | "modify" | "delete" | "rename";
  summary: string;
  author: string | null;
  timestamp: string;          // ISO timestamp
  gitHash: string | null;
}

/** Module-level aggregated summary */
export interface ModuleSummary {
  path: string;               // directory path
  summary: string;
  fileCount: number;
  children: string[];         // sub-module paths
  keyExports: string[];
  lastUpdatedAt: string;
}

/** Freshness check result */
export interface FreshnessResult {
  path: string;
  isStale: boolean;
  indexedAt: string | null;
  currentHash: string | null;
  indexedHash: string | null;
  changedFiles: string[];
}

/** Search result from knowledge query */
export interface SearchResult {
  path: string;
  type: "file" | "directory";
  summary: string;
  relevance: number;          // 0-1 score
}
