/**
 * MemoryStore — the central read/write layer for all memory docs.
 * Translates between in-memory types and markdown files on disk.
 */

import path from "node:path";
import fs from "node:fs";
import {
  resolveMemPath,
  readMemDoc,
  writeMemDoc,
  deleteMemDoc,
  listMemDocs,
  getMemrepoDir,
  parseMarkdown,
} from "./markdown.js";
import { Timeline } from "./timeline.js";
import type {
  FileMeta,
  ModuleMeta,
  ProjectMeta,
  TimelineEntry,
} from "../types.js";

export class MemoryStore {
  public timeline: Timeline;
  private memDir: string;

  constructor(private repoRoot: string) {
    this.memDir = getMemrepoDir(repoRoot);
    this.timeline = new Timeline(repoRoot);
  }

  // ─── File-level memory ──────────────────────────────────

  writeFile(meta: FileMeta, body: string): void {
    const memPath = resolveMemPath(this.repoRoot, meta.path, "file");
    writeMemDoc(memPath, meta as Record<string, unknown>, body);
  }

  readFile(sourcePath: string): { meta: FileMeta; body: string } | null {
    const memPath = resolveMemPath(this.repoRoot, sourcePath, "file");
    const doc = readMemDoc(memPath);
    if (!doc) return null;
    return { meta: doc.meta as unknown as FileMeta, body: doc.body };
  }

  deleteFile(sourcePath: string): void {
    const memPath = resolveMemPath(this.repoRoot, sourcePath, "file");
    deleteMemDoc(memPath);
  }

  // ─── Module-level memory ────────────────────────────────

  writeModule(meta: ModuleMeta, body: string): void {
    const memPath = resolveMemPath(this.repoRoot, meta.path, "module");
    writeMemDoc(memPath, meta as Record<string, unknown>, body);
  }

  readModule(dirPath: string): { meta: ModuleMeta; body: string } | null {
    const memPath = resolveMemPath(this.repoRoot, dirPath, "module");
    const doc = readMemDoc(memPath);
    if (!doc) return null;
    return { meta: doc.meta as unknown as ModuleMeta, body: doc.body };
  }

  // ─── Project-level memory ──────────────────────────────

  writeProject(meta: ProjectMeta, body: string): void {
    const memPath = resolveMemPath(this.repoRoot, "", "project");
    writeMemDoc(memPath, meta as Record<string, unknown>, body);
  }

  readProject(): { meta: ProjectMeta; body: string } | null {
    const memPath = resolveMemPath(this.repoRoot, "", "project");
    const doc = readMemDoc(memPath);
    if (!doc) return null;
    return { meta: doc.meta as unknown as ProjectMeta, body: doc.body };
  }

  // ─── Timeline ───────────────────────────────────────────

  recordChange(entry: TimelineEntry): void {
    this.timeline.append(entry);
  }

  // ─── Query / Search ─────────────────────────────────────

  /** Search all memory docs for a keyword — returns matching file paths + snippets */
  search(query: string): Array<{ memPath: string; sourcePath: string; snippet: string }> {
    const allDocs = listMemDocs(this.memDir);
    const results: Array<{ memPath: string; sourcePath: string; snippet: string }> = [];
    const queryLower = query.toLowerCase();

    for (const docPath of allDocs) {
      if (docPath.endsWith("_timeline.md")) continue; // skip timeline for search

      const content = fs.readFileSync(docPath, "utf-8");
      if (!content.toLowerCase().includes(queryLower)) continue;

      const { meta, body } = parseMarkdown(content);
      const sourcePath = (meta.path as string) ?? docPath;

      // Extract a snippet around the match
      const lines = body.split("\n");
      const matchLine = lines.find((l) => l.toLowerCase().includes(queryLower));
      const snippet = matchLine?.trim().slice(0, 150) ?? "";

      results.push({ memPath: docPath, sourcePath, snippet });
    }

    return results;
  }

  /** Get all file-level memories under a path */
  getFilesUnder(dirPath: string): Array<{ meta: FileMeta; body: string }> {
    const memDir = path.join(this.memDir, dirPath);
    if (!fs.existsSync(memDir)) return [];

    const docs = listMemDocs(memDir);
    const results: Array<{ meta: FileMeta; body: string }> = [];

    for (const docPath of docs) {
      if (path.basename(docPath).startsWith("_")) continue; // skip _module.md, _project.md
      const doc = readMemDoc(docPath);
      if (doc && doc.meta.type === "file") {
        results.push({ meta: doc.meta as unknown as FileMeta, body: doc.body });
      }
    }

    return results;
  }

  /** Get stats */
  getStats(): { totalFiles: number; totalModules: number; hasProject: boolean } {
    const allDocs = listMemDocs(this.memDir);
    let files = 0;
    let modules = 0;
    let hasProject = false;

    for (const docPath of allDocs) {
      const name = path.basename(docPath);
      if (name === "_project.md") hasProject = true;
      else if (name === "_module.md") modules++;
      else if (name !== "_timeline.md") files++;
    }

    return { totalFiles: files, totalModules: modules, hasProject };
  }
}
