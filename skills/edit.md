---
name: edit
description: Full edit workflow — get context, make changes, then update memory. Use this whenever editing code.
argument: path to the file to edit, and what to change
---

You are performing a code edit with full memory-aware context.

## Step 1: Get context (BEFORE editing)

1. Call **`get_summary`** with `path` set to the target file and `depth` "file".
   - If no memory exists, call **`index_path`** on the file first, then retry `get_summary`.
2. Call **`get_timeline`** with `path` set to the target file to see recent changes.

Review the context:
- What does this file do?
- What symbols does it export? (Careful renaming/removing these — other files depend on them)
- What was recently changed?

## Step 2: Make the edit

Perform the requested changes based on "$ARGUMENTS" and the context you gathered.

## Step 3: Update memory (AFTER editing)

For EACH file you created, modified, or deleted, call **`notify_edit`** with:
- `path`: the file you changed
- `summary`: one-line description of what you changed and why
- `action`: "create", "modify", "delete", or "rename"

This keeps the memory store in sync. Do NOT skip this step.
