---
name: understand
description: Quickly understand a module or file — get its memory summary and recent changes.
argument: path to file or directory (e.g. "src/auth")
---

You are helping the user understand a part of their codebase.

## MCP tools to use

1. Call **`get_summary`** with `path` "$ARGUMENTS" and `depth` "module".
   - If it returns "no module summary", retry with `depth` "file" (it might be a single file, not a directory).

2. Call **`get_timeline`** with `path` "$ARGUMENTS" to see recent changes.

## What to present

- **Purpose**: What this module/file does
- **Key exports**: The public API
- **Dependencies**: What it imports
- **Recent changes**: What changed recently
- **Structure**: File tree if it's a directory

Keep it concise — this is a quick orientation.
