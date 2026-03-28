# MemRepo — Incremental Codebase Memory

## What is this?

MemRepo is an MCP server + Claude Code skills combo that gives AI assistants persistent, incremental memory about a codebase. Instead of re-reading the entire repo every session, it maintains a SQLite-backed knowledge base that updates incrementally.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Claude Code Skills (workflow orchestration) │
│  /onboard  /understand  /before-edit  ...   │
├─────────────────────────────────────────────┤
│  MCP Server (data layer)                     │
│  index_path · get_summary · get_timeline ... │
├─────────────────────────────────────────────┤
│  Indexer          │  Storage (SQLite)         │
│  parser.ts        │  entries table            │
│  diffTracker.ts   │  changes table            │
│  languages.ts     │  modules table            │
└─────────────────────────────────────────────┘
```

## Project Structure

- `src/server.ts` — MCP server entry point, tool definitions
- `src/types.ts` — Shared TypeScript types
- `src/storage/` — SQLite schema and data access layer
- `src/indexer/` — Code parsing, symbol extraction, git diff tracking
- `skills/` — Claude Code skill definitions (the workflow layer)

## MCP Tools

| Tool | Purpose |
|------|---------|
| `index_path` | Index a file/directory (incremental) |
| `get_summary` | Get summary at file/module/tree level |
| `get_timeline` | View change history with time filtering |
| `record_change` | Log what was changed and why |
| `search_knowledge` | Keyword search across indexed knowledge |
| `get_dependencies` | Import graph for a file |
| `check_freshness` | Check if index is up-to-date |
| `get_stats` | Overall index statistics |

## Skills

| Skill | Usage | Purpose |
|-------|-------|---------|
| `/onboard` | `/onboard .` | First-time full scan of a repo |
| `/understand` | `/understand src/auth` | Quick orientation on a module |
| `/before-edit` | `/before-edit src/api/handler.ts` | Get context before editing |
| `/after-edit` | `/after-edit "refactored auth flow"` | Update memory after changes |
| `/what-changed` | `/what-changed 7d` | View recent change timeline |

## Setup

```bash
npm install
npm run build

# Or for development:
npm run dev
```

Add to Claude Code settings:
```json
{
  "mcpServers": {
    "memrepo": {
      "command": "node",
      "args": ["dist/server.js"],
      "env": { "MEMREPO_ROOT": "/path/to/target/repo" }
    }
  }
}
```

## Key Design Decisions

- **Regex-based parsing** (no AST): keeps dependencies minimal, works across languages
- **SQLite with WAL mode**: fast concurrent reads, single-file storage
- **Git-aware incrementality**: only re-indexes files changed since last indexed commit
- **Skills as orchestration**: MCP tools are atomic; skills compose them into workflows
- **.memrepo/ directory**: all state lives in the target repo, easy to gitignore
