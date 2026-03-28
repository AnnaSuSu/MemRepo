/**
 * Timeline — append-only markdown changelog.
 *
 * Format of _timeline.md:
 * ```
 * # Timeline
 *
 * ## 2025-03-28
 *
 * - **14:30:00** `modify` `src/auth/login.ts` — Refactored token validation *(alice)*
 * - **14:25:00** `create` `src/auth/middleware.ts` — Added rate limiting middleware *(alice)*
 *
 * ## 2025-03-27
 * ...
 * ```
 */

import fs from "node:fs";
import path from "node:path";
import {
  resolveMemPath,
  readMemDoc,
  appendToFile,
} from "./markdown.js";
import type { TimelineEntry } from "../types.js";

export class Timeline {
  private filePath: string;

  constructor(private repoRoot: string) {
    this.filePath = resolveMemPath(repoRoot, "", "timeline");
  }

  /** Append a new entry to the timeline */
  append(entry: TimelineEntry): void {
    // Ensure file exists with header
    if (!fs.existsSync(this.filePath)) {
      fs.mkdirSync(path.dirname(this.filePath), {
        recursive: true,
      });
      fs.writeFileSync(this.filePath, "# Timeline\n\n", "utf-8");
    }

    const content = fs.readFileSync(this.filePath, "utf-8");
    const date = entry.timestamp.slice(0, 10); // YYYY-MM-DD
    const time = entry.timestamp.slice(11, 19); // HH:MM:SS
    const author = entry.author ? ` *(${entry.author})*` : "";
    const hash = entry.git_hash ? ` \`${entry.git_hash.slice(0, 7)}\`` : "";
    const line = `- **${time}**${hash} \`${entry.action}\` \`${entry.path}\` — ${entry.summary}${author}`;

    const dateHeader = `## ${date}`;

    if (content.includes(dateHeader)) {
      // Insert after existing date header
      const updated = content.replace(
        dateHeader + "\n",
        dateHeader + "\n\n" + line + "\n"
      );
      fs.writeFileSync(this.filePath, updated, "utf-8");
    } else {
      // Add new date section at the top (after # Timeline header)
      const updated = content.replace(
        "# Timeline\n",
        `# Timeline\n\n${dateHeader}\n\n${line}\n`
      );
      fs.writeFileSync(this.filePath, updated, "utf-8");
    }
  }

  /** Read the full timeline as raw markdown */
  readAll(): string {
    if (!fs.existsSync(this.filePath)) return "# Timeline\n\n*No changes recorded yet.*";
    return fs.readFileSync(this.filePath, "utf-8");
  }

  /** Read timeline entries since a given date/time */
  readSince(since: string): string {
    const full = this.readAll();
    const lines = full.split("\n");
    const result: string[] = ["# Timeline\n"];
    let include = false;

    for (const line of lines) {
      // Date header: ## 2025-03-28
      if (line.startsWith("## ")) {
        const date = line.slice(3).trim();
        include = date >= since.slice(0, 10);
      }
      if (include) {
        result.push(line);
      }
    }

    return result.length > 1
      ? result.join("\n")
      : "# Timeline\n\n*No changes since " + since + ".*";
  }

  /** Get entries for a specific path */
  readForPath(pathPrefix: string): string {
    const full = this.readAll();
    const lines = full.split("\n");
    const result: string[] = [`# Timeline for \`${pathPrefix}\`\n`];
    let currentDate = "";

    for (const line of lines) {
      if (line.startsWith("## ")) {
        currentDate = line;
        continue;
      }
      if (line.includes(`\`${pathPrefix}`) || line.includes(`\`${pathPrefix}/`)) {
        // Add date header if this is first match for this date
        if (currentDate && result[result.length - 1] !== currentDate) {
          result.push("", currentDate, "");
        }
        result.push(line);
      }
    }

    return result.length > 1
      ? result.join("\n")
      : `# Timeline for \`${pathPrefix}\`\n\n*No changes recorded.*`;
  }
}
