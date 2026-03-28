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
  version: "0.2.0",
});

// ─── Tool: index_path ─────────────────────────────────────

server.tool(
  "index_path",
  "Index a file or directory — parses code, extracts symbols, writes .md memory docs. Incremental by default.",
  {
    path: z.string().describe("Relative path to index (file or directory)"),
    force: z.boolean().optional().describe("Force full re-index (default: false)"),
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

// ─── Tool: get_summary ────────────────────────────────────

server.tool(
  "get_summary",
  "Read the memory doc for a file or module. Returns the stored markdown summary at the requested granularity.",
  {
    path: z.string().describe("Relative path"),
    depth: z.enum(["file", "module", "project"]).optional().describe("Granularity (default: file)"),
  },
  async ({ path: targetPath, depth }) => {
    const level = depth ?? "file";

    if (level === "project") {
      const proj = store.readProject();
      if (!proj) return { content: [{ type: "text" as const, text: "No project summary. Run `index_path` with path `.` first." }] };
      return { content: [{ type: "text" as const, text: formatDoc(proj.meta, proj.body) }] };
    }

    if (level === "module") {
      const mod = store.readModule(targetPath);
      if (!mod) return { content: [{ type: "text" as const, text: `No module summary for ${targetPath}. Run index_path first.` }] };
      return { content: [{ type: "text" as const, text: formatDoc(mod.meta, mod.body) }] };
    }

    const file = store.readFile(targetPath);
    if (!file) return { content: [{ type: "text" as const, text: `No memory for ${targetPath}. Run index_path first.` }] };
    return { content: [{ type: "text" as const, text: formatDoc(file.meta, file.body) }] };
  }
);

// ─── Tool: get_timeline ───────────────────────────────────

server.tool(
  "get_timeline",
  "Read the change timeline. Supports filtering by path and time range.",
  {
    path: z.string().optional().describe("Filter by path prefix"),
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

// ─── Tool: record_change ──────────────────────────────────

server.tool(
  "record_change",
  "Record a change to the timeline. Call this after modifying code to track what/why.",
  {
    path: z.string().describe("File that was changed"),
    summary: z.string().describe("What was changed and why"),
    action: z.enum(["create", "modify", "delete", "rename"]).optional().describe("Change type (default: modify)"),
  },
  async ({ path: filePath, summary, action }) => {
    indexer.recordChange(filePath, summary, action ?? "modify");
    return {
      content: [{ type: "text" as const, text: `✓ Recorded: \`${action ?? "modify"}\` \`${filePath}\` — ${summary}` }],
    };
  }
);

// ─── Tool: search_knowledge ───────────────────────────────

server.tool(
  "search_knowledge",
  "Search all memory docs by keyword. Matches file paths, summaries, and symbol names.",
  {
    query: z.string().describe("Keyword or phrase to search for"),
  },
  async ({ query }) => {
    const results = store.search(query);
    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: `No results for "${query}".` }] };
    }

    const lines = results.map(
      (r) => `- **${r.sourcePath}**: ${r.snippet}`
    );
    return {
      content: [{ type: "text" as const, text: `Found ${results.length} matches:\n\n${lines.join("\n")}` }],
    };
  }
);

// ─── Tool: check_freshness ───────────────────────────────

server.tool(
  "check_freshness",
  "Check if the memory for a path is up-to-date with git HEAD.",
  {
    path: z.string().describe("Relative path to check"),
  },
  async ({ path: targetPath }) => {
    const result = indexer.checkFreshness(targetPath);
    const status = result.isStale ? "STALE" : "FRESH";
    let text = `**${status}**: \`${targetPath}\`\n`;
    text += `- Indexed at: ${result.indexedAt ?? "never"}\n`;
    text += `- Indexed hash: \`${result.indexedHash ?? "none"}\`\n`;
    text += `- Current hash: \`${result.currentHash ?? "none"}\`\n`;
    if (result.changedFiles.length > 0) {
      text += `- Changed files (${result.changedFiles.length}):\n`;
      for (const f of result.changedFiles.slice(0, 20)) {
        text += `  - \`${f}\`\n`;
      }
      if (result.changedFiles.length > 20) {
        text += `  - ... and ${result.changedFiles.length - 20} more\n`;
      }
    }
    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── Tool: get_stats ──────────────────────────────────────

server.tool(
  "get_stats",
  "Get overall memory store statistics.",
  {},
  async () => {
    const stats = store.getStats();
    return {
      content: [{
        type: "text" as const,
        text: `**Memory Store Stats**\n- Files: ${stats.totalFiles}\n- Modules: ${stats.totalModules}\n- Project summary: ${stats.hasProject ? "yes" : "no"}`,
      }],
    };
  }
);

// ─── Tool: read_doc ───────────────────────────────────────

server.tool(
  "read_doc",
  "Read a raw memory doc (.md file) from the .memrepo directory. Useful for debugging or detailed inspection.",
  {
    path: z.string().describe("Relative source path (e.g. 'src/server.ts') — will read its corresponding .memrepo doc"),
    type: z.enum(["file", "module", "project", "timeline"]).optional().describe("Doc type (default: file)"),
  },
  async ({ path: sourcePath, type: docType }) => {
    const level = docType ?? "file";

    if (level === "timeline") {
      return { content: [{ type: "text" as const, text: store.timeline.readAll() }] };
    }
    if (level === "project") {
      const proj = store.readProject();
      return { content: [{ type: "text" as const, text: proj ? formatRaw(proj.meta, proj.body) : "No project doc." }] };
    }
    if (level === "module") {
      const mod = store.readModule(sourcePath);
      return { content: [{ type: "text" as const, text: mod ? formatRaw(mod.meta, mod.body) : "No module doc." }] };
    }
    const file = store.readFile(sourcePath);
    return { content: [{ type: "text" as const, text: file ? formatRaw(file.meta, file.body) : "No file doc." }] };
  }
);

// ─── Helpers ──────────────────────────────────────────────

function formatDoc(meta: Record<string, unknown>, body: string): string {
  return body;
}

function formatRaw(meta: Record<string, unknown>, body: string): string {
  const metaStr = Object.entries(meta)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  return `**Frontmatter:**\n\`\`\`\n${metaStr}\n\`\`\`\n\n${body}`;
}

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
