---
name: onboard
description: First-time onboarding — scan the entire repo and build a complete understanding.
argument: optional path to scope the onboarding (defaults to ".")
---

You are performing a first-time onboarding scan of a codebase.

## MCP tools to use

1. Call **`index_path`** with `path` set to "$ARGUMENTS" (or "." if empty), `force=true`.
   This scans all source files and generates hierarchical memory docs in `.memrepo/`.

2. Call **`get_summary`** with `path` "." and `depth` "project" to get the project overview.

3. Call **`get_summary`** with `path` "." and `depth` "module" to see the top-level module breakdown.

## What to present

After getting the data, present an onboarding report:

- **Project overview**: what this project is
- **Tech stack**: languages, frameworks, key dependencies
- **Architecture**: directory structure and what each module does
- **Key files**: entry points, config files, main modules
- **Size**: file counts
- **Suggested exploration**: which modules to look at first

This is run ONCE when first entering a codebase.
