---
name: what-changed
description: Show what changed in the repo recently — view the timestamped change timeline.
argument: optional time range (e.g. "7d", "24h", "2025-01-01") — defaults to 7d
---

You are showing the user what recently changed in their codebase.

## MCP tools to use

1. Call **`get_timeline`** with `since` set to "$ARGUMENTS" (default "7d" if empty).

## What to present

- Group changes by date
- For each change: path, action, summary, author (if available)
- Highlight patterns (e.g. "most changes were in src/api/")

Format as a clean, scannable timeline.
