---
name: understand
description: Quickly understand a module or file — indexes if stale, then returns summary + deps + recent changes.
argument: path to file or directory (e.g. "src/auth")
---

You are helping the user understand a part of their codebase using the memrepo MCP tools.

Follow these steps IN ORDER:

1. Call `check_freshness` with the path "$ARGUMENTS".
2. If the result shows `isStale: true`, call `index_path` with the path "$ARGUMENTS" to update the index.
3. Call `get_summary` with path "$ARGUMENTS" and depth "tree" to get the full module breakdown.
4. Call `get_dependencies` for the main entry file in that path (e.g. index.ts, mod.rs, __init__.py).
5. Call `get_timeline` with path "$ARGUMENTS" and since "7d" to see recent changes.
6. Present a clear, structured summary to the user:
   - **Purpose**: What this module/file does (from the summary)
   - **Key exports**: The important public API
   - **Dependencies**: What it depends on and what depends on it
   - **Recent changes**: What changed in the last 7 days
   - **Structure**: File tree if it's a directory

Keep it concise — this is a quick orientation, not a deep dive.
