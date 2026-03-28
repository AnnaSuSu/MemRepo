import fs from "node:fs";
import path from "node:path";
import { detectLanguage } from "./languages.js";
import type { IndexedEntry } from "../types.js";

/**
 * Parse a source file and extract structural information.
 * Uses regex-based heuristics (no AST) to keep dependencies minimal.
 */
export function parseFile(filePath: string, repoRoot: string): IndexedEntry {
  const content = fs.readFileSync(filePath, "utf-8");
  const relativePath = path.relative(repoRoot, filePath);
  const language = detectLanguage(filePath);
  const stats = fs.statSync(filePath);

  const symbols = extractSymbols(content, language);
  const dependencies = extractDependencies(content, language);
  const summary = generateFileSummary(relativePath, language, symbols, content);

  return {
    path: relativePath,
    type: "file",
    language,
    summary,
    symbols,
    dependencies,
    lastIndexedAt: new Date().toISOString(),
    gitHash: null, // caller fills this in
    size: stats.size,
  };
}

/** Extract exported symbols (functions, classes, types, constants) */
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
      /^(\w+)\s*=/gm,
    ],
    rust: [
      /pub\s+(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/g,
    ],
    go: [
      /^func\s+(\w*\s*)?([A-Z]\w+)/gm,
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
      // Handle grouped exports like "export { a, b, c }"
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

/** Extract import/dependency paths */
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

/** Generate a one-line summary for the file */
function generateFileSummary(
  filePath: string,
  language: string | null,
  symbols: string[],
  content: string
): string {
  const lineCount = content.split("\n").length;
  const lang = language ?? "unknown";
  const symbolStr =
    symbols.length > 0
      ? ` — exports: ${symbols.slice(0, 5).join(", ")}${symbols.length > 5 ? ` (+${symbols.length - 5} more)` : ""}`
      : "";

  return `${lang} file, ${lineCount} lines${symbolStr}`;
}
