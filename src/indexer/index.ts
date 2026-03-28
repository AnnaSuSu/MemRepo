import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { Repository } from "../storage/repository.js";
import { parseFile } from "./parser.js";
import { getHeadHash, getStaleFiles, getGitAuthor } from "./diffTracker.js";
import type { ModuleSummary, FreshnessResult } from "../types.js";

const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  ".memrepo",
  "dist",
  "build",
  "__pycache__",
  ".next",
  ".nuxt",
  "vendor",
  "target",
  "*.min.js",
  "*.map",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
];

export class Indexer {
  private ig: ReturnType<typeof ignore>;

  constructor(
    private repo: Repository,
    private repoRoot: string
  ) {
    this.ig = ignore();
    this.ig.add(DEFAULT_IGNORE);

    // Load .gitignore if it exists
    const gitignorePath = path.join(repoRoot, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      this.ig.add(content);
    }
  }

  /**
   * Index a path (file or directory). Incremental by default:
   * only re-indexes files that changed since last indexed commit.
   */
  async indexPath(
    targetPath: string,
    opts: { force?: boolean } = {}
  ): Promise<{ indexed: number; skipped: number }> {
    const absPath = path.resolve(this.repoRoot, targetPath);
    const stat = fs.statSync(absPath);
    let indexed = 0;
    let skipped = 0;

    if (stat.isFile()) {
      this.indexSingleFile(absPath);
      return { indexed: 1, skipped: 0 };
    }

    // Directory — find all source files
    const files = fg.sync("**/*", {
      cwd: absPath,
      absolute: true,
      onlyFiles: true,
      dot: false,
    });

    // Determine which files need re-indexing
    const headHash = getHeadHash(this.repoRoot);
    let staleSet: Set<string> | null = null;

    if (!opts.force) {
      const entry = this.repo.getEntry(path.relative(this.repoRoot, absPath));
      const sinceHash = entry?.gitHash ?? null;
      if (sinceHash && sinceHash === headHash) {
        // Nothing changed
        return { indexed: 0, skipped: files.length };
      }
      const staleFiles = getStaleFiles(this.repoRoot, targetPath, sinceHash);
      staleSet = new Set(staleFiles.map((f) => path.resolve(this.repoRoot, f)));
    }

    for (const file of files) {
      const rel = path.relative(this.repoRoot, file);
      if (this.ig.ignores(rel)) {
        skipped++;
        continue;
      }
      if (staleSet && !staleSet.has(file)) {
        skipped++;
        continue;
      }

      try {
        this.indexSingleFile(file);
        indexed++;
      } catch {
        skipped++;
      }
    }

    // Update directory-level module summary
    this.updateModuleSummary(targetPath);

    return { indexed, skipped };
  }

  private indexSingleFile(absPath: string): void {
    const entry = parseFile(absPath, this.repoRoot);
    entry.gitHash = getHeadHash(this.repoRoot);
    this.repo.upsertEntry(entry);
  }

  /** Build/update a module summary for a directory */
  private updateModuleSummary(dirPath: string): void {
    const entries = this.repo.getEntriesByPrefix(dirPath);
    const allExports = entries.flatMap((e) => e.symbols);
    const subDirs = [
      ...new Set(
        entries
          .map((e) => {
            const rel = path.relative(dirPath, e.path);
            const firstSegment = rel.split(path.sep)[0]!;
            return firstSegment.includes(".") ? null : path.join(dirPath, firstSegment);
          })
          .filter(Boolean)
      ),
    ] as string[];

    const mod: ModuleSummary = {
      path: dirPath,
      summary: `Module with ${entries.length} files. Key exports: ${allExports.slice(0, 10).join(", ")}`,
      fileCount: entries.length,
      children: subDirs,
      keyExports: allExports.slice(0, 20),
      lastUpdatedAt: new Date().toISOString(),
    };

    this.repo.upsertModule(mod);
  }

  /** Check if a path's index is up-to-date */
  checkFreshness(targetPath: string): FreshnessResult {
    const entry = this.repo.getEntry(targetPath);
    const currentHash = getHeadHash(this.repoRoot);
    const indexedHash = entry?.gitHash ?? null;
    const isStale = !indexedHash || indexedHash !== currentHash;

    const changedFiles = isStale
      ? getStaleFiles(this.repoRoot, targetPath, indexedHash)
      : [];

    return {
      path: targetPath,
      isStale,
      indexedAt: entry?.lastIndexedAt ?? null,
      currentHash,
      indexedHash,
      changedFiles,
    };
  }

  /** Record a manual change note */
  recordChange(
    filePath: string,
    summary: string,
    action: "create" | "modify" | "delete" | "rename" = "modify"
  ): void {
    this.repo.recordChange({
      path: filePath,
      action,
      summary,
      author: getGitAuthor(this.repoRoot),
      timestamp: new Date().toISOString(),
      gitHash: getHeadHash(this.repoRoot),
    });
  }
}
