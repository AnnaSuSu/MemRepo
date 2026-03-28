# MemRepo

**Incremental codebase memory for AI coding assistants.**

MemRepo gives AI assistants persistent, hierarchical memory about a codebase. Instead of re-reading the entire repo every session, it maintains a structured knowledge base in `.memrepo/` that updates incrementally — one file at a time, in real time.

No vector DB. No SQLite. Just `.md` files that are human-readable, git-trackable, and LLM-friendly.

---

## Why?

Every time an AI coding assistant enters a codebase, it starts from scratch — re-reading files, re-understanding architecture, losing all context from previous sessions.

MemRepo solves this by maintaining a **persistent, incremental memory layer**:

- **First visit**: Full scan → generates a hierarchical understanding (project → modules → files)
- **Every edit**: Real-time single-file update → memory stays in sync as code evolves
- **Next session**: AI reads compact summaries instead of raw source files → instant context

The memory is compact enough to fit in context. The AI reads the project summary to know the structure, drills into module summaries for detail, and reads file summaries when editing. No search needed — the hierarchy *is* the navigation.

---

## How It Works

### Three-Layer Memory Hierarchy

```
.memrepo/
├── _project.md                  # Layer 1: Whole-project overview
├── _timeline.md                 # Append-only changelog with timestamps
├── src/
│   ├── _module.md               # Layer 2: src/ module summary
│   ├── auth/
│   │   ├── _module.md           # Layer 2: auth/ module summary
│   │   ├── login.ts.md          # Layer 3: Single-file understanding
│   │   └── middleware.ts.md
│   └── api/
│       ├── _module.md
│       └── handler.ts.md
```

| Layer | File | What it captures |
|-------|------|------------------|
| **Project** | `_project.md` | Languages, file counts, directory structure, tech stack |
| **Module** | `_module.md` | Directory-level summary, file list, key exports, sub-modules |
| **File** | `<name>.md` | Purpose, exported symbols, dependencies, line count |
| **Timeline** | `_timeline.md` | Append-only changelog — who changed what, when, and why |

### The Two Core Operations

**1. Full Scan** (onboarding — run once)

```
index_path(".")
  → Walk all source files
  → Parse each file (extract symbols, deps, language)
  → Write file-level .md for each
  → Build module-level summaries bottom-up
  → Build project-level overview
```

**2. Incremental Update** (after every edit — real-time)

```
notify_edit("src/auth/login.ts", "refactored token validation", "modify")
  → Re-parse just that one file           ~10ms
  → Overwrite its .md memory doc           ~5ms
  → Append timestamped timeline entry      ~1ms
  → Done.
```

Module and project summaries are **lazily rebuilt** — they update automatically the next time someone reads them, not on every edit. This keeps `notify_edit` fast.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  AI Coding Tool                                   │
│  (Claude Code / OpenCode / Cursor / Codex / …)    │
│                                                    │
│  Skills tell the AI which MCP tools to call        │
│  and when. No CLAUDE.md or rules file needed.      │
├──────────────────────────────────────────────────┤
│  MCP Server (4 tools)                              │
│                                                    │
│  index_path ── full/directory scan                 │
│  notify_edit ── single-file incremental update     │
│  get_summary ── read memory (with lazy rebuild)    │
│  get_timeline ── read change history               │
├──────────────────────────────────────────────────┤
│  Indexer                │  Storage                  │
│  ├─ parser.ts           │  ├─ markdown.ts           │
│  ├─ diffTracker.ts      │  ├─ memoryStore.ts        │
│  ├─ languages.ts        │  └─ timeline.ts           │
│  └─ index.ts            │                           │
└──────────────────────────────────────────────────┘
│
▼
.memrepo/   (hierarchical markdown files on disk)
```

---

## MCP Tools

MemRepo exposes **4 MCP tools** — intentionally minimal.

### `index_path`

Scan a file or directory. Parses all source files, extracts symbols and dependencies, writes the three-layer memory hierarchy.

```
Parameters:
  path:  string  — Relative path to index ("." for entire repo)
  force: boolean — Force full re-index, ignore cache (default: false)

Returns:
  "Indexed 42 files, skipped 3. Memory docs written to .memrepo/"
```

Use for initial onboarding or when you want to rebuild everything.

### `notify_edit`

Lightweight single-file update. Re-parses one file, updates its memory doc, appends a timeline entry. Called after every code edit.

```
Parameters:
  path:    string — Relative path of the changed file
  summary: string — One-line description of what changed and why
  action:  "create" | "modify" | "delete" | "rename" (default: "modify")

Returns:
  "✓ modify src/auth/login.ts — refactored token validation
   5 exports, 3 deps. Timeline updated."
```

This is the core incremental update tool. It does NOT rebuild module/project summaries — those rebuild lazily on next read.

### `get_summary`

Read memory at any granularity level. Module and project summaries are automatically rebuilt if any child files have been updated since last build.

```
Parameters:
  path:  string — Relative path (file or directory)
  depth: "file" | "module" | "project" (default: "file")

Returns:
  The stored markdown summary at the requested granularity.
```

### `get_timeline`

Read the timestamped change timeline. Supports filtering by path prefix or time range.

```
Parameters:
  path:  string — Filter by path prefix (e.g. "src/auth")
  since: string — Time filter: ISO date or relative like "7d", "24h"

Returns:
  Formatted timeline grouped by date.
```

---

## Skills (Workflow Orchestration)

Skills are the user-facing interface. Each skill is a **self-contained workflow** that tells the AI exactly which MCP tools to call and in what order. The AI doesn't need to figure out the workflow — the skill defines it.

### Available Skills

| Skill | Purpose | MCP tools used |
|-------|---------|----------------|
| `/onboard` | First-time full scan and orientation | `index_path` → `get_summary` |
| `/understand <path>` | Quick understanding of a module or file | `get_summary` → `get_timeline` |
| `/edit <path> <what>` | Full edit workflow with context and auto memory update | `get_summary` → `get_timeline` → *edit* → `notify_edit` |
| `/what-changed [time]` | View recent change timeline | `get_timeline` |

### The Edit Workflow

The `/edit` skill is the core workflow. It handles the complete cycle:

```
/edit src/auth/login.ts fix the token validation bug

Step 1: GET CONTEXT (before editing)
  → get_summary("src/auth/login.ts", depth="file")
  → get_timeline("src/auth/login.ts")
  → AI now knows: purpose, exports, deps, recent changes

Step 2: MAKE THE EDIT
  → AI edits the code with full context

Step 3: UPDATE MEMORY (after editing)
  → notify_edit("src/auth/login.ts", "fixed token validation bug", "modify")
  → Memory is now in sync. Timeline records what happened.
```

### Installing Skills

Skills are Markdown files in the `skills/` directory. To use them with your AI tool, copy them to the tool's command directory:

**Claude Code:**
```bash
# In your target repo:
mkdir -p .claude/commands
cp /path/to/memrepo/skills/*.md .claude/commands/

# Then use: /project:onboard, /project:edit, etc.
```

**OpenCode:**
```bash
mkdir -p .opencode/commands
cp /path/to/memrepo/skills/*.md .opencode/commands/
```

**Cursor:**
```bash
mkdir -p .cursor/commands
cp /path/to/memrepo/skills/*.md .cursor/commands/
```

---

## Quick Start (Claude Code)

### Step 1: Add MCP Server

```bash
claude mcp add memrepo -- npx memrepo
```

That's it. No cloning, no building. `npx` downloads and runs it automatically.

> **Note**: By default, MemRepo uses the current working directory as the repo root. To specify a different repo, set `MEMREPO_ROOT`:
> ```bash
> claude mcp add memrepo -e MEMREPO_ROOT=/path/to/your/repo -- npx memrepo
> ```

### Step 2: Install Skills

```bash
# In your target project directory:
mkdir -p .claude/commands

# Download skills from npm package:
npx memrepo --help 2>/dev/null; \
cp $(npm root -g 2>/dev/null || echo node_modules)/memrepo/skills/*.md .claude/commands/ 2>/dev/null || \
  npx -y -p memrepo sh -c 'cp $(dirname $(which memrepo))/../lib/node_modules/memrepo/skills/*.md .claude/commands/' 2>/dev/null || \
  echo "Manual download: https://github.com/AnnaSuSu/MemRepo/tree/main/skills"
```

Or just manually download the 4 skill files from [GitHub](https://github.com/AnnaSuSu/MemRepo/tree/main/skills) into `.claude/commands/`.

### Step 3: Use

Open Claude Code in your project and run:

```bash
# First time — full scan and orientation:
/project:onboard

# Understand a module:
/project:understand src/auth

# Edit with full context + auto memory sync:
/project:edit src/auth/login.ts fix the token validation bug

# See what changed recently:
/project:what-changed 7d
```

### Other Tools

**OpenCode:**
```bash
# Add MCP server in opencode.json:
{
  "mcp": {
    "memrepo": {
      "command": "npx",
      "args": ["memrepo"]
    }
  }
}

# Install skills:
mkdir -p .opencode/commands
# Copy skills/*.md files to .opencode/commands/
```

**Cursor:**
```bash
mkdir -p .cursor/commands
# Copy skills/*.md files to .cursor/commands/
```

### From Source (Alternative)

```bash
git clone https://github.com/AnnaSuSu/MemRepo.git
cd MemRepo
npm install && npm run build

# Then add to Claude Code:
claude mcp add memrepo -- node /path/to/MemRepo/dist/server.js
```

---

## What Gets Stored

### File-Level Memory (`<name>.md`)

```markdown
---
type: file
path: src/auth/login.ts
updated: 2025-03-28T14:30:00.000Z
language: typescript
size: 2450
symbols: ["validateToken", "refreshToken", "TokenError"]
dependencies: ["jsonwebtoken", "./types", "../config"]
---

# login.ts

**Language**: typescript | **Lines**: 87 | **Path**: `src/auth/login.ts`

## Purpose

Defines 3 exports: validateToken, refreshToken, TokenError.

## Exports

- `validateToken`
- `refreshToken`
- `TokenError`

## Dependencies

- `jsonwebtoken`
- `./types`
- `../config`
```

### Module-Level Memory (`_module.md`)

```markdown
# src/auth Module

**Files**: 4 | **Languages**: typescript | **Sub-modules**: 0

## Structure

- `login.ts` — validateToken, refreshToken, TokenError
- `middleware.ts` — authMiddleware, rateLimiter
- `types.ts` — AuthUser, TokenPayload
- `index.ts` — (re-exports)

## Key Exports

- `validateToken`
- `authMiddleware`
- `AuthUser`
```

### Timeline (`_timeline.md`)

```markdown
# Timeline

## 2025-03-28

- **14:30:00** `modify` `src/auth/login.ts` — refactored token validation *(alice)*
- **14:25:00** `create` `src/auth/middleware.ts` — added rate limiting middleware *(alice)*

## 2025-03-27

- **16:00:00** `modify` `src/api/handler.ts` — fixed error handling *(bob)*
```

---

## Language Support

MemRepo extracts symbols and dependencies from **30+ languages**:

| Category | Languages |
|----------|-----------|
| **Web** | TypeScript, JavaScript, HTML, CSS, SCSS, Vue, Svelte |
| **Systems** | Rust, Go, C, C++ |
| **Backend** | Python, Java, Kotlin, Ruby, PHP, C#, Scala |
| **Config** | JSON, YAML, TOML |
| **Data** | SQL, GraphQL, Protobuf |
| **Other** | Lua, Shell, Markdown |

Symbol extraction uses regex patterns (no AST dependency) — fast and works everywhere.

---

## Design Decisions

### Why Markdown, not a database?

- **Human-readable**: You can browse `.memrepo/` directly, no special tools needed
- **Git-trackable**: Changes to memory are diffable and committable
- **LLM-friendly**: Markdown is the native format for LLMs — no serialization overhead
- **Zero dependencies**: No SQLite, no vector DB, no external services

### Why lazy module rebuild?

When `notify_edit` is called, only the file-level `.md` is updated. Module and project summaries rebuild lazily on next read. This keeps the edit path fast (~15ms) while summaries stay eventually consistent.

### Why skill-driven?

Skills define the complete workflow — which tools to call, in what order, what to present. The AI doesn't need a rules file (CLAUDE.md, etc.) to know how to use MemRepo. Each skill is self-contained:

- `/onboard` knows to call `index_path` then `get_summary`
- `/edit` knows to get context first, then edit, then call `notify_edit`
- No ambient instructions needed

### Why no search?

The memory hierarchy is compact enough to fit in context. The AI reads the project summary to know the structure, navigates to module summaries, drills into file summaries. It's a hierarchy, not a database — the AI naturally knows where to look.

---

## Project Structure

```
memrepo/
├── src/
│   ├── server.ts              # MCP server — 4 tool definitions
│   ├── types.ts               # Shared TypeScript types
│   ├── indexer/
│   │   ├── index.ts           # Indexing orchestration + lazy rebuild
│   │   ├── parser.ts          # Multi-language symbol extraction
│   │   ├── diffTracker.ts     # Change detection (git + mtime fallback)
│   │   └── languages.ts      # Language detection (30+ extensions)
│   └── storage/
│       ├── markdown.ts        # Markdown file I/O with YAML frontmatter
│       ├── memoryStore.ts     # Central read/write layer
│       └── timeline.ts       # Append-only timeline manager
├── skills/                    # Skill definitions (copy to your tool's command dir)
│   ├── onboard.md
│   ├── edit.md
│   ├── understand.md
│   └── what-changed.md
├── package.json
└── tsconfig.json
```

---

## License

MIT
