/**
 * Indexer — orchestrates parsing and writing memory docs.
 * Handles incremental indexing, module summaries, and project summaries.
 */

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { MemoryStore } from "../storage/memoryStore.js";
import { parseFile } from "./parser.js";
import { getHeadHash, getStaleFiles, getGitAuthor } from "./diffTracker.js";
import type { ModuleMeta, ProjectMeta, FreshnessResult } from "../types.js";

const DEFAULT_IGNORE = [
  "node_modules", ".git", ".memrepo", "dist", "build",
  "__pycache__", ".next", ".nuxt", "vendor", "target",
  "*.min.js", "*.map", "*.lock",
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
];

export class Indexer {
  private ig: ReturnType<typeof ignore>;

  constructor(
    private store: MemoryStore,
    private repoRoot: string
  ) {
    this.ig = ignore();
    this.ig.add(DEFAULT_IGNORE);

    const gitignorePath = path.join(repoRoot, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      this.ig.add(fs.readFileSync(gitignorePath, "utf-8"));
    }
  }

  /**
   * Index a path (file or directory).
   * Incremental by default — only re-indexes changed files.
   */
  async indexPath(
    targetPath: string,
    opts: { force?: boolean } = {}
  ): Promise<{ indexed: number; skipped: number }> {
    const absPath = path.resolve(this.repoRoot, targetPath);
    const stat = fs.statSync(absPath);

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

    const headHash = getHeadHash(this.repoRoot);
    let staleSet: Set<string> | null = null;

    if (!opts.force) {
      const existing = this.store.readModule(targetPath);
      const sinceHash = (existing?.meta.git_hash as string) ?? null;
      if (sinceHash && sinceHash === headHash) {
        return { indexed: 0, skipped: files.length };
      }
      const staleFiles = getStaleFiles(this.repoRoot, targetPath, sinceHash);
      staleSet = new Set(staleFiles.map((f) => path.resolve(this.repoRoot, f)));
    }

    let indexed = 0;
    let skipped = 0;

    for (const file of files) {
      const rel = path.relative(this.repoRoot, file);
      if (this.ig.ignores(rel)) { skipped++; continue; }
      if (staleSet && !staleSet.has(file)) { skipped++; continue; }

      try {
        this.indexSingleFile(file);
        indexed++;
      } catch {
        skipped++;
      }
    }

    // Build module summaries bottom-up
    this.buildModuleSummary(targetPath);

    // Update project summary if indexing root
    if (targetPath === "." || targetPath === "") {
      this.buildProjectSummary();
    }

    return { indexed, skipped };
  }

  private indexSingleFile(absPath: string): void {
    const result = parseFile(absPath, this.repoRoot);
    result.meta.git_hash = getHeadHash(this.repoRoot);
    this.store.writeFile(result.meta, result.body);
  }

  /** Build a _module.md summary for a directory */
  private buildModuleSummary(dirPath: string): void {
    const files = this.store.getFilesUnder(dirPath);
    if (files.length === 0) return;

    const allExports = files.flatMap((f) => f.meta.symbols);
    const languages = [...new Set(files.map((f) => f.meta.language).filter(Boolean))] as string[];

    // Find sub-directories
    const subDirs = [
      ...new Set(
        files.map((f) => {
          const rel = path.relative(dirPath || ".", f.meta.path);
          const first = rel.split(path.sep)[0]!;
          return first.includes(".") ? null : first;
        }).filter(Boolean)
      ),
    ] as string[];

    const meta: ModuleMeta = {
      type: "module",
      path: dirPath || ".",
      updated: new Date().toISOString(),
      git_hash: getHeadHash(this.repoRoot),
      file_count: files.length,
      children: subDirs,
      key_exports: allExports.slice(0, 20),
    };

    const bodyLines: string[] = [
      `# ${dirPath || "Root"} Module`,
      "",
      `**Files**: ${files.length} | **Languages**: ${languages.join(", ") || "n/a"} | **Sub-modules**: ${subDirs.length}`,
      "",
      "## Structure",
      "",
    ];

    // Group files by sub-directory
    const grouped: Record<string, typeof files> = { ".": [] };
    for (const f of files) {
      const rel = path.relative(dirPath || ".", f.meta.path);
      const dir = path.dirname(rel);
      const key = dir === "." ? "." : dir.split(path.sep)[0]!;
      if (!grouped[key]) grouped[key] = [];
      grouped[key]!.push(f);
    }

    for (const [dir, dirFiles] of Object.entries(grouped)) {
      if (dir !== ".") bodyLines.push(`### ${dir}/`);
      for (const f of dirFiles!) {
        const name = path.basename(f.meta.path);
        const symStr = f.meta.symbols.length > 0
          ? ` — ${f.meta.symbols.slice(0, 3).join(", ")}`
          : "";
        bodyLines.push(`- \`${name}\`${symStr}`);
      }
      bodyLines.push("");
    }

    if (allExports.length > 0) {
      bodyLines.push("## Key Exports");
      bodyLines.push("");
      for (const exp of allExports.slice(0, 20)) {
        bodyLines.push(`- \`${exp}\``);
      }
      bodyLines.push("");
    }

    this.store.writeModule(meta, bodyLines.join("\n"));
  }

  /** Build the top-level _project.md */
  private buildProjectSummary(): void {
    const stats = this.store.getStats();
    const files = this.store.getFilesUnder(".");
    const languages = [...new Set(files.map((f) => f.meta.language).filter(Boolean))] as string[];

    const meta: ProjectMeta = {
      type: "project",
      path: ".",
      updated: new Date().toISOString(),
      git_hash: getHeadHash(this.repoRoot),
      languages,
      total_files: stats.totalFiles,
      total_modules: stats.totalModules,
    };

    const bodyLines: string[] = [
      "# Project Overview",
      "",
      `**Indexed files**: ${stats.totalFiles} | **Modules**: ${stats.totalModules} | **Languages**: ${languages.join(", ")}`,
      "",
      "## Directory Structure",
      "",
    ];

    // List top-level directories
    const topDirs = new Set<string>();
    for (const f of files) {
      const first = f.meta.path.split(path.sep)[0]!;
      if (!first.includes(".")) topDirs.add(first);
    }

    for (const dir of topDirs) {
      const dirFiles = files.filter((f) => f.meta.path.startsWith(dir + path.sep));
      bodyLines.push(`- **${dir}/**: ${dirFiles.length} files`);
    }

    bodyLines.push("");

    this.store.writeProject(meta, bodyLines.join("\n"));
  }

  /** Check freshness of a path */
  checkFreshness(targetPath: string): FreshnessResult {
    const existing = this.store.readFile(targetPath) ?? this.store.readModule(targetPath);
    const currentHash = getHeadHash(this.repoRoot);
    const indexedHash = (existing?.meta.git_hash as string) ?? null;
    const isStale = !indexedHash || indexedHash !== currentHash;

    const changedFiles = isStale
      ? getStaleFiles(this.repoRoot, targetPath, indexedHash)
      : [];

    return {
      path: targetPath,
      isStale,
      indexedAt: existing?.meta.updated ?? null,
      currentHash,
      indexedHash,
      changedFiles,
    };
  }

  /** Record a change to timeline */
  recordChange(
    filePath: string,
    summary: string,
    action: "create" | "modify" | "delete" | "rename" = "modify"
  ): void {
    this.store.recordChange({
      timestamp: new Date().toISOString(),
      action,
      path: filePath,
      summary,
      author: getGitAuthor(this.repoRoot),
      git_hash: getHeadHash(this.repoRoot),
    });
  }
}
