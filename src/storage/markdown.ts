/**
 * Markdown file I/O with YAML frontmatter.
 * This IS the database — human-readable, LLM-friendly, git-trackable.
 */

import fs from "node:fs";
import path from "node:path";
import type { Frontmatter } from "../types.js";

const FRONTMATTER_SEP = "---";

// ─── Parse ────────────────────────────────────────────────

/** Parse a markdown file into frontmatter object + body string */
export function parseMarkdown(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_SEP) {
    return { meta: {}, body: content };
  }

  const endIdx = lines.indexOf(FRONTMATTER_SEP, 1);
  if (endIdx === -1) {
    return { meta: {}, body: content };
  }

  const yamlLines = lines.slice(1, endIdx);
  const meta: Record<string, unknown> = {};

  for (const line of yamlLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Parse arrays: [a, b, c]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    // Parse numbers
    else if (typeof value === "string" && /^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    // Parse booleans
    else if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (value === "null") value = null;
    // Strip quotes
    else if (
      typeof value === "string" &&
      value.startsWith('"') &&
      value.endsWith('"')
    ) {
      value = value.slice(1, -1);
    }

    meta[key] = value;
  }

  const body = lines.slice(endIdx + 1).join("\n").trimStart();
  return { meta, body };
}

// ─── Serialize ────────────────────────────────────────────

/** Serialize frontmatter + body into a markdown string */
export function serializeMarkdown(
  meta: Record<string, unknown>,
  body: string
): string {
  const yamlLines: string[] = [];

  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    if (value === null) {
      yamlLines.push(`${key}: null`);
    } else if (Array.isArray(value)) {
      yamlLines.push(`${key}: [${value.map((v) => `"${v}"`).join(", ")}]`);
    } else {
      yamlLines.push(`${key}: ${value}`);
    }
  }

  return `---\n${yamlLines.join("\n")}\n---\n\n${body}\n`;
}

// ─── File Operations ──────────────────────────────────────

const MEMREPO_DIR = ".memrepo";

/** Get the .memrepo storage path for a given repo root */
export function getMemrepoDir(repoRoot: string): string {
  return path.join(repoRoot, MEMREPO_DIR);
}

/** Resolve where a memory doc lives for a given source path */
export function resolveMemPath(
  repoRoot: string,
  sourcePath: string,
  type: "file" | "module" | "project" | "timeline"
): string {
  const base = getMemrepoDir(repoRoot);

  if (type === "project") return path.join(base, "_project.md");
  if (type === "timeline") return path.join(base, "_timeline.md");
  if (type === "module") return path.join(base, sourcePath, "_module.md");
  // file: mirror the path, append .md
  return path.join(base, sourcePath + ".md");
}

/** Read and parse a memory doc. Returns null if not found. */
export function readMemDoc(filePath: string): {
  meta: Record<string, unknown>;
  body: string;
} | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return parseMarkdown(content);
}

/** Write a memory doc (creates directories as needed) */
export function writeMemDoc(
  filePath: string,
  meta: Record<string, unknown>,
  body: string
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, serializeMarkdown(meta, body), "utf-8");
}

/** Append a line to a file (for timeline) */
export function appendToFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, content + "\n", "utf-8");
}

/** Delete a memory doc */
export function deleteMemDoc(filePath: string): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

/** List all memory docs under a directory */
export function listMemDocs(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const results: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return results;
}
