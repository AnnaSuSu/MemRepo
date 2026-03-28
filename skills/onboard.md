---
name: onboard
description: First-time onboarding — scan the entire repo and build a complete understanding. Run this once when entering a new codebase.
argument: optional path to scope the onboarding (defaults to ".")
---

You are performing a first-time onboarding scan of a codebase using memrepo MCP tools.

Follow these steps:

1. Set the target path to "$ARGUMENTS" if provided, otherwise ".".
2. Call `index_path` with path set to the target and force=true to do a full scan.
3. Call `get_summary` with the target path and depth "tree" to get the full picture.
4. Call `get_stats` to see overall numbers.
5. Present an onboarding report:
   - **Project overview**: what this project is (infer from structure and file names)
   - **Tech stack**: languages, frameworks, key dependencies
   - **Architecture**: top-level directory structure and what each module does
   - **Key files**: entry points, config files, main modules
   - **Size**: file counts, lines of code estimate
   - **Suggested exploration**: which modules to look at first based on centrality

This is meant to be run ONCE when first entering a codebase. After this, use `/understand` for specific modules.
