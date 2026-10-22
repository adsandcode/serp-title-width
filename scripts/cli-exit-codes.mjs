/**
 * Runs the built CLI as a separate process and checks its exit codes.
 * 0 = pass, 1 = a title must be fixed, 2 = ruler failed or bad arguments.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "..", "dist", "cli.js");

const SAMPLE = "家常料理食譜站｜滷肉飯做法・便當菜色・120道快速晚餐";
const CUT = "一二三四五六七八九十百千萬甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午";

const dir = mkdtempSync(join(tmpdir(), "stw-cli-"));
writeFileSync(join(dir, "ok.html"), `<title>${SAMPLE}</title>`);

const cases = [
  ["clean title", ["--titles", SAMPLE], 0],
  ["clean HTML directory", [dir], 0],
  ["--json on a clean title", ["--titles", SAMPLE, "--json"], 0],
  ["title over 648px", ["--titles", SAMPLE, CUT], 1],
  ["two question marks", ["--titles", "第一次去京都要住哪？住幾晚？"], 1],
  ["--selftest alone", ["--selftest"], 0],
  ["--selftest mixed with a path", ["--selftest", "x.html"], 2],
  ["--selftest mixed with --titles", ["--titles", "a", "--selftest"], 2],
  ["no arguments", [], 2],
  ["unknown option", ["--nope", dir], 2],
  ["path that does not exist", [join(dir, "missing")], 2],
  ["--titles with nothing after it", ["--titles"], 2],
  ["paths mixed with --titles", [dir, "--titles", SAMPLE], 2],
];

let failures = 0;
try {
  for (const [label, args, want] of cases) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    const ok = r.status === want;
    if (!ok) failures++;
    console.log(`  [${ok ? "ok" : "FAIL"}] exit ${r.status} (want ${want})  ${label}`);
    if (!ok) console.log((r.stdout + r.stderr).split("\n").map((l) => "        " + l).join("\n"));
  }
  const j = spawnSync(process.execPath, [cli, "--json", "--titles", SAMPLE], { encoding: "utf8" });
  const parsed = JSON.parse(j.stdout);
  const ok = parsed.results[0].title === SAMPLE && parsed.results[0].px === 564.7;
  if (!ok) failures++;
  console.log(`  [${ok ? "ok" : "FAIL"}] --json output parses and keeps the title intact through the pipe`);

  // [fix 4] A site has many index.html files; the report must say which one.
  const site = join(dir, "site");
  mkdirSync(join(site, "guides"), { recursive: true });
  writeFileSync(join(site, "index.html"), `<title>${SAMPLE}</title>`);
  writeFileSync(join(site, "guides", "index.html"), `<title>${CUT}</title>`);
  const s = spawnSync(process.execPath, [cli, site], { encoding: "utf8" });
  const want = join(site, "guides", "index.html");
  const pathOk = s.status === 1 && s.stdout.includes(`[FAIL] ${want}`);
  if (!pathOk) failures++;
  console.log(`  [${pathOk ? "ok" : "FAIL"}] [fix 4] a failing page is named by its path under the scanned folder, not just "index.html"`);
  if (!pathOk) console.log("        " + s.stdout.split("\n").filter((l) => l.startsWith("[")).join(" | "));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} exit-code check(s) failed` : "\nall exit-code checks passed");
process.exit(failures ? 1 : 0);
