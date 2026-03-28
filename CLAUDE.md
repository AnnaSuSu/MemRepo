# MemRepo — Incremental Codebase Memory (Markdown-based)

## What is this?

MemRepo gives AI assistants persistent, incremental memory about a codebase. Instead of re-reading the entire repo every session, it maintains a **hierarchical markdown knowledge base** in `.memrepo/` that updates incrementally.

No vector DB. No SQLite. Just `.md` files that are human-readable, git-trackable, and LLM-friendly.

## How it stores knowledge

```
.memrepo/
├── _project.md                  # Coarsest grain: whole-project overview
├── _timeline.md                 # Append-only change log (like mem0)
├── src/
│   ├── _module.md               # Mid grain: src/ module summary
│   ├── auth/
│   │   ├── _module.md           # Mid grain: auth/ summary
│   │   ├── login.ts.md          # Finest grain: single-file understanding
│   │   └── middleware.ts.md
│   └── api/
│       ├── _module.md
│       └── handler.ts.md
```

Three granularity levels:
- **Project** (`_project.md`): languages, structure, file counts
- **Module** (`_module.md`): directory-level summary, key exports, sub-modules
- **File** (`<name>.md`): symbols, dependencies, purpose, line count

Plus a **Timeline** (`_timeline.md`): append-only changelog grouped by date.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Claude Code Skills (workflow orchestration) │
│  /onboard  /understand  /before-edit  ...   │
├─────────────────────────────────────────────┤
│  MCP Server (9 tools)                        │
│  index_path · get_summary · get_timeline ... │
├─────────────────────────────────────────────┤
│  Indexer            │  Storage (Markdown)     │
│  parser.ts          │  markdown.ts            │
│  diffTracker.ts     │  memoryStore.ts         │
│  languages.ts       │  timeline.ts            │
└─────────────────────────────────────────────┘
```

## Project Structure

- `src/server.ts` — MCP server entry point, 9 tool definitions
- `src/types.ts` — Shared TypeScript types
- `src/storage/markdown.ts` — Markdown file I/O with YAML frontmatter
- `src/storage/memoryStore.ts` — Central read/write layer for all memory docs
- `src/storage/timeline.ts` — Append-only timeline manager
- `src/indexer/parser.ts` — Multi-language symbol extraction (regex, no AST)
- `src/indexer/diffTracker.ts` — Git-aware incremental change detection
- `src/indexer/languages.ts` — Language detection (30+ extensions)
- `src/indexer/index.ts` — Indexing orchestration
- `skills/` — 5 Claude Code skill definitions

## MCP Tools

| Tool | Purpose |
|------|---------|
| `index_path` | Parse & index a file/dir → write .md memory docs |
| `get_summary` | Read memory at file/module/project granularity |
| `get_timeline` | Read change timeline, filter by path/time |
| `record_change` | Append to timeline: what changed and why |
| `search_knowledge` | Keyword search across all memory docs |
| `check_freshness` | Is the memory up-to-date with git HEAD? |
| `get_stats` | Memory store statistics |
| `read_doc` | Read raw memory doc for debugging |

## Skills

| Skill | Purpose |
|-------|---------|
| `/onboard` | First-time full scan → project overview |
| `/understand <path>` | Quick orientation on a module |
| `/before-edit <path>` | Get context before editing a file |
| `/after-edit <description>` | Update memory after changes |
| `/what-changed [time]` | View recent change timeline |

## Setup

```bash
npm install
npm run build
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
