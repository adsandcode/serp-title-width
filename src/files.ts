/**
 * Read <title> elements from HTML files on disk.
 *
 * Directories are walked recursively for .html and .htm files. Entries whose
 * names start with "." are skipped (the same as Python's glob), and symbolic
 * links to directories are not followed, so a link loop cannot hang a build.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { normalizeWhitespace, type TitleInput } from "./rules.js";

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HTML_EXT = /\.html?$/i;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0" };

/**
 * Decode the character references that commonly appear in titles: the five
 * XML entities, &nbsp;, and numeric references. Other named references are
 * left as written. Google shows the decoded text, so "&amp;" must be measured
 * as one character, not five.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const n = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n) : whole;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ref) ? NAMED[ref] : whole;
  });
}

/** The first <title> in a document, decoded and whitespace-normalised, or null. */
export function extractTitle(html: string): string | null {
  const m = TITLE_RE.exec(html);
  return m ? normalizeWhitespace(decodeEntities(m[1])) : null;
}

export interface CollectResult {
  items: TitleInput[];
  /** Paths given by the caller that do not exist. */
  missing: string[];
  /** Files that were read but have no <title>, or are not valid UTF-8. */
  skipped: { path: string; reason: string }[];
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && HTML_EXT.test(e.name)) out.push(p);
  }
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Collect titles from files and directories. A file named explicitly is read
 * whatever its extension; directories contribute only .html and .htm files.
 */
export function collectTitles(paths: readonly string[]): CollectResult {
  const items: TitleInput[] = [];
  const missing: string[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const p of paths) {
    let files: string[];
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        files = [];
        walk(p, files);
        files.sort();
      } else {
        files = [p];
      }
    } catch {
      missing.push(p);
      continue;
    }
    for (const f of files) {
      let html: string;
      try {
        html = utf8.decode(readFileSync(f));
      } catch {
        skipped.push({ path: f, reason: "not readable as UTF-8" });
        continue;
      }
      const title = extractTitle(html);
      if (title === null) skipped.push({ path: f, reason: "no <title> element" });
      else items.push({ src: f, title });
    }
  }
  return { items, missing, skipped };
}
