---
name: before-edit
description: Get context before editing a file — shows summary, dependencies, dependents, and warnings.
argument: path to the file you're about to edit
---

You are preparing the user (or an AI agent) to safely edit a file using memrepo MCP tools.

Follow these steps:

1. Call `check_freshness` for "$ARGUMENTS". If stale, call `index_path` first.
2. Call `get_summary` with path "$ARGUMENTS" and depth "file".
3. Call `get_dependencies` for "$ARGUMENTS".
4. Call `get_timeline` with path "$ARGUMENTS" and limit 5 to see recent changes.
5. Present a pre-edit briefing:
   - **File**: path, language, size
   - **Purpose**: what this file does
   - **Exports**: symbols other files depend on (CAREFUL changing these!)
   - **Imports**: what this file needs
   - **Depended on by**: files that import this one (changes here may break them)
   - **Recent changes**: last 5 changes for context
   - **Warnings**: flag if many files depend on this one, or if it was recently changed

This helps prevent breaking changes and gives context for smarter edits.
