#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MemoryStore } from "./storage/memoryStore.js";
import { Indexer } from "./indexer/index.js";

const REPO_ROOT = process.env.MEMREPO_ROOT || process.cwd();

const store = new MemoryStore(REPO_ROOT);
const indexer = new Indexer(store, REPO_ROOT);

const server = new McpServer({
  name: "memrepo",
  version: "0.3.0",
});

// ─── Tool 1: index_path ───────────────────────────────────
// Full/directory scan — used for onboarding and catching up.

server.tool(
  "index_path",
  "Scan a file or directory — parses all source files, extracts symbols/deps, writes hierarchical .md memory docs (project → module → file). Use for initial onboarding or bulk re-scan.",
  {
    path: z.string().describe("Relative path to index (file or directory, '.' for entire repo)"),
    force: z.boolean().optional().describe("Force full re-index ignoring cache (default: false)"),
  },
  async ({ path, force }) => {
    const result = await indexer.indexPath(path, { force });
    return {
      content: [{
        type: "text" as const,
        text: `Indexed ${result.indexed} files, skipped ${result.skipped}. Memory docs written to .memrepo/`,
      }],
    };
  }
);

// ─── Tool 2: notify_edit ──────────────────────────────────
// Lightweight single-file update — called after EVERY code edit.

server.tool(
  "notify_edit",
  "Notify that a file was edited. Re-parses the single file, updates its memory doc, and appends a timestamped timeline entry. Call this after EVERY code change.",
  {
    path: z.string().describe("Relative path of the changed file"),
    summary: z.string().describe("One-line description of what changed and why"),
    action: z.enum(["create", "modify", "delete", "rename"]).optional().describe("Change type (default: modify)"),
  },
  async ({ path: filePath, summary, action }) => {
    try {
      const result = indexer.notifyEdit(filePath, summary, action ?? "modify");
      const actionStr = action ?? "modify";

      if (actionStr === "delete") {
        return {
          content: [{
            type: "text" as const,
            text: `✓ \`${actionStr}\` \`${filePath}\` — ${summary}\nMemory doc removed, timeline updated.`,
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `✓ \`${actionStr}\` \`${filePath}\` — ${summary}\n${result.symbols} exports, ${result.dependencies} deps. Timeline updated.`,
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: `✗ Failed to update \`${filePath}\`: ${err instanceof Error ? err.message : String(err)}`,
        }],
      };
    }
  }
);

// ─── Tool 3: get_summary ──────────────────────────────────
// Read memory at any granularity. Lazily rebuilds module/project
// summaries if child files have been updated since last build.

server.tool(
  "get_summary",
  "Read the memory summary for a file, module (directory), or the entire project. Module/project summaries are automatically rebuilt if any child files were updated since last build.",
  {
    path: z.string().describe("Relative path (file or directory)"),
    depth: z.enum(["file", "module", "project"]).optional().describe("Granularity level (default: auto-detect)"),
  },
  async ({ path: targetPath, depth }) => {
    const level = depth ?? "file";

    if (level === "project") {
      const proj = indexer.ensureProjectFresh();
      if (!proj) return { content: [{ type: "text" as const, text: "No project summary yet. Run `index_path` with path `.` first." }] };
      return { content: [{ type: "text" as const, text: proj.body }] };
    }

    if (level === "module") {
      const mod = indexer.ensureModuleFresh(targetPath);
      if (!mod) return { content: [{ type: "text" as const, text: `No module summary for \`${targetPath}\`. Run \`index_path\` first.` }] };
      return { content: [{ type: "text" as const, text: mod.body }] };
    }

    const file = store.readFile(targetPath);
    if (!file) return { content: [{ type: "text" as const, text: `No memory for \`${targetPath}\`. Run \`index_path\` first.` }] };
    return { content: [{ type: "text" as const, text: file.body }] };
  }
);

// ─── Tool 4: get_timeline ─────────────────────────────────
// Read the change timeline with optional filters.

server.tool(
  "get_timeline",
  "Read the timestamped change timeline. Filter by file path or time range to see what changed and when.",
  {
    path: z.string().optional().describe("Filter by path prefix (e.g. 'src/auth')"),
    since: z.string().optional().describe("Time filter: ISO date or relative like '7d', '24h'"),
  },
  async ({ path: targetPath, since }) => {
    let result: string;

    if (targetPath) {
      result = store.timeline.readForPath(targetPath);
    } else if (since) {
      const sinceDate = resolveRelativeTime(since);
      result = store.timeline.readSince(sinceDate);
    } else {
      result = store.timeline.readAll();
    }

    return { content: [{ type: "text" as const, text: result }] };
  }
);

// ─── Helpers ──────────────────────────────────────────────

function resolveRelativeTime(since: string): string {
  const match = since.match(/^(\d+)([dhm])$/);
  if (!match) return since; // assume ISO date

  const val = parseInt(match[1]!);
  const unit = match[2]!;
  const ms =
    unit === "d" ? val * 86400000 :
    unit === "h" ? val * 3600000 :
    val * 60000;

  return new Date(Date.now() - ms).toISOString();
}

// ─── Start ────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start memrepo server:", err);
  process.exit(1);
});
