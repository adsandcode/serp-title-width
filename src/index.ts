#!/usr/bin/env node
/**
 * serp-title-width MCP server (stdio).
 *
 * Two tools:
 *   measure_titles     titles in, pixel widths and verdicts out. Pure.
 *   check_title_files  reads <title> from local HTML files, then the same checks.
 *                      Reads only; never writes, never touches the network.
 *
 * The ruler's positive and negative controls run once at startup and the
 * server refuses to start if any of them fails.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { measureTitles } from "./rules.js";
import { collectTitles } from "./files.js";
import { run as runSelftest } from "./selftest.js";

const ASSUMPTIONS =
  "Model: Google search results on google.com with the zh-TW (Traditional Chinese, Taiwan) interface, " +
  "Chrome on Windows, title font Arial 22px, desktop result column 652px, mobile first line 343px, " +
  "measured 2026-09-18. Full-width characters (East Asian Width W or F: CJK ideographs, kana, Hangul, " +
  "full-width punctuation, most emoji) count 22px; printable ASCII uses Arial's own advance widths at 22px; " +
  "other half-width characters count 12.2px; zero-width characters count 0 and each grapheme cluster " +
  "(such as an emoji ZWJ sequence) counts once. Kerning is not modelled. Tiers: safe <= 572px, long > 572px (warning), edge > 630px (must fix), cut > 648px (must fix). " +
  "Japanese and Korean use the same full-width assumption but were not separately measured. " +
  "Google may rewrite title links, so a passing title is not a guarantee of what is displayed.";

const RULES =
  "Fails: tier edge or cut; more than 2 separators (、 or ，) in a title over 572px; more than 1 full-width " +
  "question mark (？); a trailing phrase after the last 、 or ， shared by more than 2 titles in the same call " +
  "(boilerplate; a site name after a colon is not counted, as Google suggests that pattern); empty title; " +
  "the same 2-4 ideograph run 3 or more times (keyword stuffing). " +
  "Warnings: tier long; more than 2 separators in a title within 572px; " +
  "text before the first ？：、，wider than the 343px mobile first line.";

const text = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
});

const server = new McpServer({ name: "serp-title-width", version: "0.1.0" });

server.tool(
  "measure_titles",
  "Measure page titles by rendered pixel width in Google search results, not by character count, and check them " +
  "for truncation and title-link problems. Pass every title of a site in one call so boilerplate tails shared " +
  "across titles are detected. Returns per title: px, full_width_units (px / 22), tier (safe/long/edge/cut), " +
  "fails, warns; plus boilerplate_tails for the whole set and verdict 'fix' if any title fails. " +
  ASSUMPTIONS + " " + RULES,
  {
    titles: z.array(z.string()).min(1).describe("Title strings exactly as they appear in <title>, already decoded (\"&\" not \"&amp;\")."),
  },
  async ({ titles }) => {
    const r = measureTitles(titles.map((title, i) => ({ src: `(input ${i + 1})`, title })));
    return text({ verdict: r.failed ? "fix" : "pass", ...r });
  },
);

server.tool(
  "check_title_files",
  "Read the first <title> element from local .html/.htm files and run the same pixel-width checks as " +
  "measure_titles across all of them. Each path may be a file (read whatever its extension) or a directory; " +
  "directories are searched recursively for .html and .htm files, skipping node_modules and names that start " +
  "with '.', and stop with an error after 20000 files. Only the title in the document head counts; titles in " +
  "comments, <svg>, <script> and similar are ignored. Reads only, never writes. " +
  "Character references &amp; &lt; &gt; &quot; &apos; &nbsp; and numeric references are decoded before measuring. " +
  ASSUMPTIONS + " " + RULES,
  {
    paths: z.array(z.string()).min(1).describe("Absolute paths to HTML files or directories on this machine, e.g. a static site's build output."),
  },
  async ({ paths }) => {
    const { items, missing, unreadable, skipped, tooMany } = collectTitles(paths);
    if (tooMany || missing.length || unreadable.length || !items.length) {
      const error = tooMany ? `more than ${tooMany.limit} HTML files under ${tooMany.path}`
        : missing.length ? "path not found"
        : unreadable.length ? "cannot read some paths"
        : "no <title> found";
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error, missing_paths: missing, unreadable_paths: unreadable, skipped_files: skipped,
          }, null, 2),
        }],
      };
    }
    const r = measureTitles(items);
    return text({ verdict: r.failed ? "fix" : "pass", ...r, skipped_files: skipped });
  },
);

async function main() {
  const lines: string[] = [];
  if (!runSelftest((s) => lines.push(s))) {
    console.error("serp-title-width: ruler controls failed, refusing to start.");
    console.error(lines.join("\n"));
    process.exit(2);
  }
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("serp-title-width: fatal", err);
  process.exit(1);
});
