/**
 * Parse source files and extract structural info.
 * Returns FileMeta + markdown body for storage.
 */

import fs from "node:fs";
import path from "node:path";
import { detectLanguage } from "./languages.js";
import type { FileMeta } from "../types.js";

export interface ParseResult {
  meta: FileMeta;
  body: string; // markdown body describing the file
}

/**
 * Parse a source file → FileMeta + markdown summary body.
 */
export function parseFile(filePath: string, repoRoot: string): ParseResult {
  const content = fs.readFileSync(filePath, "utf-8");
  const relativePath = path.relative(repoRoot, filePath);
  const language = detectLanguage(filePath);
  const stats = fs.statSync(filePath);

  const symbols = extractSymbols(content, language);
  const dependencies = extractDependencies(content, language);
  const lineCount = content.split("\n").length;

  const meta: FileMeta = {
    type: "file",
    path: relativePath,
    updated: new Date().toISOString(),
    git_hash: null, // caller fills in
    language,
    size: stats.size,
    symbols,
    dependencies,
  };

  // Generate a rich markdown body
  const body = buildFileBody(relativePath, language, lineCount, symbols, dependencies, content);

  return { meta, body };
}

function buildFileBody(
  filePath: string,
  language: string | null,
  lineCount: number,
  symbols: string[],
  dependencies: string[],
  content: string
): string {
  const lines: string[] = [];
  const fileName = path.basename(filePath);

  lines.push(`# ${fileName}`);
  lines.push("");
  lines.push(`**Language**: ${language ?? "unknown"} | **Lines**: ${lineCount} | **Path**: \`${filePath}\``);
  lines.push("");

  // Purpose — infer from file name and content
  lines.push("## Purpose");
  lines.push("");
  lines.push(inferPurpose(filePath, language, symbols, content));
  lines.push("");

  // Exports
  if (symbols.length > 0) {
    lines.push("## Exports");
    lines.push("");
    for (const sym of symbols) {
      lines.push(`- \`${sym}\``);
    }
    lines.push("");
  }

  // Dependencies
  if (dependencies.length > 0) {
    lines.push("## Dependencies");
    lines.push("");
    for (const dep of dependencies) {
      lines.push(`- \`${dep}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Best-effort purpose inference from file name and content */
function inferPurpose(
  filePath: string,
  language: string | null,
  symbols: string[],
  content: string
): string {
  const name = path.basename(filePath, path.extname(filePath)).toLowerCase();

  // Check for common patterns
  if (name === "index" || name === "mod" || name === "__init__")
    return "Module entry point — re-exports and aggregates this directory's public API.";
  if (name.includes("test") || name.includes("spec"))
    return "Test file.";
  if (name.includes("config") || name.includes("settings"))
    return "Configuration file.";
  if (name.includes("route") || name.includes("router"))
    return "Route definitions — maps URL paths to handlers.";
  if (name.includes("middleware"))
    return "Middleware — intercepts and processes requests/responses.";
  if (name.includes("model") || name.includes("schema") || name.includes("entity"))
    return "Data model / schema definitions.";
  if (name.includes("util") || name.includes("helper"))
    return "Utility/helper functions.";
  if (name.includes("type"))
    return "Type definitions.";
  if (name.includes("server") || name.includes("app"))
    return "Application/server entry point.";

  // Fallback: describe based on exports
  if (symbols.length > 0) {
    return `Defines ${symbols.length} exports: ${symbols.slice(0, 5).join(", ")}${symbols.length > 5 ? "..." : ""}.`;
  }

  return `Source file (${language ?? "unknown"}).`;
}

// ─── Symbol extraction (unchanged logic) ──────────────────

function extractSymbols(content: string, language: string | null): string[] {
  const symbols: string[] = [];
  if (!language) return symbols;

  const patterns: Record<string, RegExp[]> = {
    typescript: [
      /export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
    ],
    javascript: [
      /export\s+(?:default\s+)?(?:function|const|let|var|class)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
      /module\.exports\s*=\s*\{([^}]+)\}/g,
    ],
    python: [
      /^def\s+(\w+)\s*\(/gm,
      /^class\s+(\w+)/gm,
    ],
    rust: [
      /pub\s+(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/g,
    ],
    go: [
      /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?([A-Z]\w+)/gm,
      /^type\s+([A-Z]\w+)/gm,
    ],
    java: [
      /public\s+(?:static\s+)?(?:class|interface|enum|record)\s+(\w+)/g,
      /public\s+(?:static\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\(/g,
    ],
  };

  const langPatterns = patterns[language];
  if (!langPatterns) return symbols;

  for (const pattern of langPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const captured = match[1];
      if (captured?.includes(",")) {
        for (const s of captured.split(",")) {
          const name = s.trim().split(/\s+as\s+/).pop()?.trim();
          if (name && /^\w+$/.test(name)) symbols.push(name);
        }
      } else if (captured && /^\w+$/.test(captured.trim())) {
        symbols.push(captured.trim());
      }
    }
  }

  return [...new Set(symbols)];
}

function extractDependencies(content: string, language: string | null): string[] {
  const deps: string[] = [];
  if (!language) return deps;

  const patterns: Record<string, RegExp[]> = {
    typescript: [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    javascript: [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    python: [
      /^import\s+([\w.]+)/gm,
      /^from\s+([\w.]+)\s+import/gm,
    ],
    rust: [
      /use\s+([\w:]+)/g,
    ],
    go: [
      /import\s+"([^"]+)"/g,
      /\t"([^"]+)"/g,
    ],
  };

  const langPatterns = patterns[language];
  if (!langPatterns) return deps;

  for (const pattern of langPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) deps.push(match[1]);
    }
  }

  return [...new Set(deps)];
}
