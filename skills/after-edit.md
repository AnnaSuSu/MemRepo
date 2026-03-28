---
name: after-edit
description: Update the memory store after editing files — re-indexes changed files and records what happened.
argument: brief description of what you changed and why
---

You are updating the memrepo knowledge base after code changes were made.

Follow these steps:

1. Call `check_freshness` with path "." to find all stale files.
2. Call `index_path` with path "." to re-index everything that changed.
3. For each changed file listed in the freshness check, call `record_change` with:
   - path: the changed file
   - summary: "$ARGUMENTS" (the user's description)
   - action: infer from context (create/modify/delete)
4. Confirm to the user:
   - Which files were re-indexed
   - What was recorded in the timeline
   - Current stats

This keeps the memory store in sync after every edit session.
