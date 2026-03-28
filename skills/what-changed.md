---
name: what-changed
description: Show what changed in the repo recently — combines git history with recorded change notes.
argument: optional time range (e.g. "7d", "24h", "2025-01-01") — defaults to 7d
---

You are helping the user understand recent changes in their codebase using memrepo MCP tools.

Follow these steps:

1. Determine the time range from "$ARGUMENTS". Default to "7d" if empty.
2. Call `get_timeline` with since set to the time range.
3. Call `get_stats` to show overall index health.
4. Present a structured timeline:
   - Group changes by date
   - For each change, show: path, action, summary, author
   - Highlight any patterns (e.g. "most changes were in src/api/")
   - Show overall stats at the bottom

Format as a clean timeline the user can quickly scan.
