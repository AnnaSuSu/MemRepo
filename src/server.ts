#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDb, closeDb } from "./storage/db.js";
import { Repository } from "./storage/repository.js";
import { Indexer } from "./indexer/index.js";

const REPO_ROOT = process.env.MEMREPO_ROOT || process.cwd();

const db = getDb(REPO_ROOT);
const repo = new Repository(db);
const indexer = new Indexer(repo, REPO_ROOT);

const server = new McpServer({
  name: "memrepo",
  version: "0.1.0",
});

// ─── Tool: index_path ─────────────────────────────────────

server.tool(
  "index_path",
  "Index a file or directory into the memory store. Incremental by default — only re-indexes files changed since last indexing.",
  {
    path: z.string().describe("Relative path to file or directory to index"),
    force: z
      .boolean()
      .optional()
      .describe("Force re-index even if unchanged (default: false)"),
  },
  async ({ path, force }) => {
    const result = await indexer.indexPath(path, { force });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { status: "ok", path, indexed: result.indexed, skipped: result.skipped },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─── Tool: get_summary ────────────────────────────────────

server.tool(
  "get_summary",
  "Get the stored summary for a file or module. Returns structural info, exports, dependencies, and a human-readable summary.",
  {
    path: z.string().describe("Relative path to file or directory"),
    depth: z
      .enum(["file", "module", "tree"])
      .optional()
      .describe("Detail level: file (single file), module (directory summary), tree (recursive)"),
  },
  async ({ path: targetPath, depth }) => {
    const level = depth ?? "file";

    if (level === "module") {
      const mod = repo.getModule(targetPath);
      if (!mod) {
        return { content: [{ type: "text" as const, text: `Module not found: ${targetPath}. Run index_path first.` }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(mod, null, 2) }] };
    }

    if (level === "tree") {
      const entries = repo.getEntriesByPrefix(targetPath);
      const mod = repo.getModule(targetPath);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ module: mod, files: entries }, null, 2),
          },
        ],
      };
    }

    // file level
    const entry = repo.getEntry(targetPath);
    if (!entry) {
      return { content: [{ type: "text" as const, text: `Entry not found: ${targetPath}. Run index_path first.` }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(entry, null, 2) }] };
  }
);

// ─── Tool: get_timeline ───────────────────────────────────

server.tool(
  "get_timeline",
  "Get the recorded change timeline for a path. Shows who changed what, when, and why.",
  {
    path: z.string().optional().describe("Filter by path prefix (omit for all)"),
    since: z
      .string()
      .optional()
      .describe("ISO timestamp or relative like '7d', '24h'"),
    limit: z.number().optional().describe("Max records to return (default: 50)"),
  },
  async ({ path: targetPath, since, limit }) => {
    let sinceDate = since;
    if (since && /^\d+[dhm]$/.test(since)) {
      const now = Date.now();
      const unit = since.slice(-1);
      const val = parseInt(since.slice(0, -1));
      const ms =
        unit === "d" ? val * 86400000 : unit === "h" ? val * 3600000 : val * 60000;
      sinceDate = new Date(now - ms).toISOString();
    }

    const changes = repo.getChanges({
      path: targetPath,
      since: sinceDate,
      limit: limit ?? 50,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ count: changes.length, changes }, null, 2),
        },
      ],
    };
  }
);

// ─── Tool: record_change ──────────────────────────────────

server.tool(
  "record_change",
  "Record a change event to the timeline. Use this after modifying code to track what was changed and why.",
  {
    path: z.string().describe("File path that was changed"),
    summary: z.string().describe("Brief description of the change and its purpose"),
    action: z
      .enum(["create", "modify", "delete", "rename"])
      .optional()
      .describe("Type of change (default: modify)"),
  },
  async ({ path: filePath, summary, action }) => {
    indexer.recordChange(filePath, summary, action ?? "modify");
    return {
      content: [{ type: "text" as const, text: `Recorded: ${action ?? "modify"} ${filePath} — ${summary}` }],
    };
  }
);

// ─── Tool: search_knowledge ───────────────────────────────

server.tool(
  "search_knowledge",
  "Search the indexed knowledge base by keyword. Matches against file paths, summaries, and symbol names.",
  {
    query: z.string().describe("Search query (keyword or phrase)"),
  },
  async ({ query }) => {
    const results = repo.searchEntries(query);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              query,
              count: results.length,
              results: results.map((r) => ({
                path: r.path,
                language: r.language,
                summary: r.summary,
                symbols: r.symbols.slice(0, 5),
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─── Tool: get_dependencies ───────────────────────────────

server.tool(
  "get_dependencies",
  "Get the dependency graph for a file — what it imports and what imports it.",
  {
    path: z.string().describe("Relative file path"),
  },
  async ({ path: filePath }) => {
    const entry = repo.getEntry(filePath);
    if (!entry) {
      return { content: [{ type: "text" as const, text: `Entry not found: ${filePath}` }] };
    }

    // Find reverse dependencies (files that import this file)
    const allEntries = repo.searchEntries(filePath);
    const importedBy = allEntries
      .filter((e) => e.path !== filePath && e.dependencies.some((d) => d.includes(filePath.replace(/\.\w+$/, ""))))
      .map((e) => e.path);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              path: filePath,
              imports: entry.dependencies,
              importedBy,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─── Tool: check_freshness ───────────────────────────────

server.tool(
  "check_freshness",
  "Check if the index for a path is up-to-date with the current git HEAD.",
  {
    path: z.string().describe("Relative path to check"),
  },
  async ({ path: targetPath }) => {
    const result = indexer.checkFreshness(targetPath);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ─── Tool: get_stats ──────────────────────────────────────

server.tool(
  "get_stats",
  "Get overall statistics about what has been indexed.",
  {},
  async () => {
    const stats = repo.getStats();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
    };
  }
);

// ─── Start ────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("SIGINT", () => {
    closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start memrepo server:", err);
  process.exit(1);
});
