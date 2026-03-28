import { execSync } from "node:child_process";
import path from "node:path";

export interface GitFileChange {
  status: "A" | "M" | "D" | "R";
  path: string;
  oldPath?: string; // for renames
}

/** Get the current HEAD commit hash, or null if no commits */
export function getHeadHash(repoRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

/** Get the current git user name */
export function getGitAuthor(repoRoot: string): string | null {
  try {
    return execSync("git config user.name", {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get files changed between two commits, or all tracked files if no base.
 */
export function getChangedFiles(
  repoRoot: string,
  baseHash: string | null,
  headHash: string | null
): GitFileChange[] {
  if (!headHash) return [];

  try {
    const cmd = baseHash
      ? `git diff --name-status ${baseHash} ${headHash}`
      : `git ls-files`;

    const output = execSync(cmd, {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();

    if (!output) return [];

    if (!baseHash) {
      // ls-files returns just paths — treat all as "added"
      return output.split("\n").map((p) => ({ status: "A" as const, path: p }));
    }

    return output.split("\n").map((line) => {
      const parts = line.split("\t");
      const statusChar = parts[0]![0] as "A" | "M" | "D" | "R";
      if (statusChar === "R") {
        return { status: "R", path: parts[2]!, oldPath: parts[1]! };
      }
      return { status: statusChar, path: parts[1]! };
    });
  } catch {
    return [];
  }
}

/**
 * Check which files under a path have changed since a given commit hash.
 */
export function getStaleFiles(
  repoRoot: string,
  dirPath: string,
  sinceHash: string | null
): string[] {
  const headHash = getHeadHash(repoRoot);
  if (!headHash) return [];
  if (!sinceHash) {
    // No prior index — everything is stale
    try {
      const output = execSync(`git ls-files ${dirPath}`, {
        cwd: repoRoot,
        encoding: "utf-8",
      }).trim();
      return output ? output.split("\n") : [];
    } catch {
      return [];
    }
  }

  const changes = getChangedFiles(repoRoot, sinceHash, headHash);
  const rel = path.relative(repoRoot, path.resolve(repoRoot, dirPath));
  return changes
    .filter((c) => c.path.startsWith(rel) || rel === ".")
    .map((c) => c.path);
}
