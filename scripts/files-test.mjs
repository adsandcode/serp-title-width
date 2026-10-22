/**
 * Directory scanning: what is read, what is skipped, and how failures are
 * reported. Real temporary folders where the OS allows it; a fake file system
 * for errors that cannot be produced portably (a folder that exists but cannot
 * be listed).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const files = await import(new URL("file:///" + resolve(here, "..", "dist", "files.js").replace(/\\/g, "/")).href);
const { collectTitles, MAX_FILES } = files;

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`  [${ok ? "ok" : "FAIL"}] ${label}${ok || !detail ? "" : "  " + detail}`);
};
const page = (title) => `<html><head><title>${title}</title></head><body></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "stw-files-"));
try {
  mkdirSync(join(dir, "sub"));
  mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "index.html"), page("京都三天兩夜行程"));
  writeFileSync(join(dir, "sub", "a.htm"), page("台北一日遊行程推薦"));
  writeFileSync(join(dir, "node_modules", "pkg", "readme.html"), page("should not be read"));
  writeFileSync(join(dir, ".git", "description.html"), page("should not be read"));
  writeFileSync(join(dir, "notes.txt"), page("only read when named explicitly"));

  const r = collectTitles([dir]);
  const got = r.items.map((i) => i.title).sort();
  check("[fix 5c] directory scan skips node_modules and .git, reads .html and .htm only",
    JSON.stringify(got) === JSON.stringify(["京都三天兩夜行程", "台北一日遊行程推薦"].sort()), JSON.stringify(got));
  check("[fix 5c] scan results keep the path relative to the given root",
    r.items.some((i) => i.src === join(dir, "sub", "a.htm")), JSON.stringify(r.items.map((i) => i.src)));

  const t = collectTitles([join(dir, "notes.txt")]);
  check("an explicitly named .txt file is read", t.items.length === 1 && t.items[0].title === "only read when named explicitly");

  check("[fix 5c] the default cap is 20,000 HTML files", MAX_FILES === 20000);
  const capped = collectTitles([dir], { maxFiles: 1 });
  check("[fix 5c] passing the cap stops the scan with an error instead of checking a partial set",
    capped.tooMany != null && capped.tooMany?.limit === 1 && capped.items.length === 0, JSON.stringify(capped.tooMany));
  const under = collectTitles([dir], { maxFiles: 2 });
  check("exactly at the cap is fine (must not flag)", !under.tooMany && under.items.length === 2);

  const missing = collectTitles([join(dir, "nope")]);
  check("a path that does not exist is reported as missing", missing.missing.length === 1 && (missing.unreadable ?? []).length === 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// A folder that exists but cannot be listed (EACCES). chmod cannot produce
// this on Windows, so the file system is replaced for this case.
const err = (code) => Object.assign(new Error(code), { code });
const dirent = (name, isDir) => ({ name, isDirectory: () => isDir, isFile: () => !isDir });
const fakeFs = {
  statSync(p) {
    if (p === "site") return { isDirectory: () => true };
    if (p === "locked-root") throw err("EACCES");
    throw err("ENOENT");
  },
  readdirSync(p) {
    if (p === "site") return [dirent("index.html", false), dirent("private", true)];
    throw err("EACCES");
  },
  readFileSync() {
    return new TextEncoder().encode(page("京都三天兩夜行程"));
  },
};
const locked = collectTitles(["site"], { fs: fakeFs });
check("[fix 5c] an unreadable subfolder is reported as unreadable, not as 'path not found'",
  locked.missing.length === 0 && locked.unreadable?.length === 1 && locked.unreadable[0].reason === "EACCES"
    && locked.unreadable[0].path === join("site", "private"),
  JSON.stringify({ missing: locked.missing, unreadable: locked.unreadable }));
check("the readable part of that folder is still read", locked.items.length === 1);
const lockedRoot = collectTitles(["locked-root"], { fs: fakeFs });
check("[fix 5c] a given path that exists but cannot be read is unreadable, not missing",
  lockedRoot.missing.length === 0 && lockedRoot.unreadable?.[0]?.reason === "EACCES",
  JSON.stringify({ missing: lockedRoot.missing, unreadable: lockedRoot.unreadable }));

console.log(failures ? `\n${failures} file check(s) failed` : "\nall file checks passed");
process.exit(failures ? 1 : 0);
