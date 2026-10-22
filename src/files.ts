/**
 * Read <title> elements from HTML files on disk.
 *
 * Directories are walked recursively for .html and .htm files. Entries whose
 * names start with "." (such as .git) and node_modules folders are skipped,
 * and symbolic links to directories are not followed, so a link loop cannot
 * hang a build. A walk stops with an error after MAX_FILES HTML files, which
 * usually means the path is not a site's build output.
 */

import * as nodeFs from "node:fs";
import { join } from "node:path";

import { normalizeWhitespace, type TitleInput } from "./rules.js";

/** Upper limit on HTML files collected from one call. */
export const MAX_FILES = 20000;

const HTML_EXT = /\.html?$/i;
const SKIP_DIRS = new Set(["node_modules"]);

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: String.fromCodePoint(0xa0),
};

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

const COMMENT = /<!--[\s\S]*?-->/g;
// Elements whose content can contain a <title> that is not the document title.
const FOREIGN = /<(svg|math|script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BODY_START = /<body[\s>]/i;
const HEAD_END = /<\/head\s*>/i;
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;

/**
 * The document title: the first <title> in the document head, decoded and
 * whitespace-normalised, or null. Comments are ignored, and so are titles
 * inside <svg>, <math>, <script>, <style>, <template> and <noscript>, or
 * anywhere after the head has ended.
 */
export function extractTitle(html: string): string | null {
  // Strip comments and foreign content first, so that text such as "<body"
  // inside a head script cannot end the head early.
  let head = html.replace(COMMENT, "").replace(FOREIGN, "");
  const body = head.search(BODY_START);
  if (body >= 0) head = head.slice(0, body);
  const end = head.search(HEAD_END);
  if (end >= 0) head = head.slice(0, end);
  const m = TITLE_RE.exec(head);
  return m ? normalizeWhitespace(decodeEntities(m[1])) : null;
}

/** The subset of node:fs used here. Replaceable in tests. */
export interface FsLike {
  statSync(path: string): { isDirectory(): boolean };
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean; isFile(): boolean }[];
  readFileSync(path: string): Uint8Array;
}

export interface CollectOptions {
  maxFiles?: number;
  fs?: FsLike;
}

export interface CollectResult {
  items: TitleInput[];
  /** Paths given by the caller that do not exist. */
  missing: string[];
  /** Folders or files that exist but could not be read, with the error code. */
  unreadable: { path: string; reason: string }[];
  /** Files that were read but have no <title> in the head, or are not valid UTF-8. */
  skipped: { path: string; reason: string }[];
  /** Set when a directory walk passed maxFiles HTML files; nothing is checked then. */
  tooMany: { path: string; limit: number } | null;
}

const code = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : String(e));
const NOT_FOUND = new Set(["ENOENT", "ENOTDIR"]);

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Collect titles from files and directories. A file named explicitly is read
 * whatever its extension; directories contribute only .html and .htm files.
 * Paths in the result keep the form they were given in, joined with the
 * relative path inside a directory.
 */
export function collectTitles(paths: readonly string[], opts: CollectOptions = {}): CollectResult {
  const fs = opts.fs ?? (nodeFs as unknown as FsLike);
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const res: CollectResult = { items: [], missing: [], unreadable: [], skipped: [], tooMany: null };
  const files: string[] = [];

  const walk = (dir: string, root: string): boolean => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      res.unreadable.push({ path: dir, reason: code(e) });
      return true;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!walk(p, root)) return false;
      } else if (e.isFile() && HTML_EXT.test(e.name)) {
        files.push(p);
        if (files.length > maxFiles) {
          res.tooMany = { path: root, limit: maxFiles };
          return false;
        }
      }
    }
    return true;
  };

  for (const p of paths) {
    let isDir: boolean;
    try {
      isDir = fs.statSync(p).isDirectory();
    } catch (e) {
      if (NOT_FOUND.has(code(e))) res.missing.push(p);
      else res.unreadable.push({ path: p, reason: code(e) });
      continue;
    }
    if (isDir) {
      if (!walk(p, p)) break;
    } else {
      files.push(p);
    }
  }
  if (res.tooMany) return res;

  for (const f of files) {
    let raw: Uint8Array;
    try {
      raw = fs.readFileSync(f);
    } catch (e) {
      res.unreadable.push({ path: f, reason: code(e) });
      continue;
    }
    let html: string;
    try {
      html = utf8.decode(raw);
    } catch {
      res.skipped.push({ path: f, reason: "not valid UTF-8" });
      continue;
    }
    const title = extractTitle(html);
    if (title === null) res.skipped.push({ path: f, reason: "no <title> in the document head" });
    else res.items.push({ src: f, title });
  }
  return res;
}
