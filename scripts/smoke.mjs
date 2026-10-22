/**
 * Talks to the built server over stdio the way a real MCP client would.
 * Compiling is not evidence that the server answers.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "..", "dist", "index.js");

const transport = new StdioClientTransport({ command: process.execPath, args: [entry] });
const client = new Client({ name: "serp-title-width-smoke", version: "0.0.0" });
await client.connect(transport);

const parse = (r) => JSON.parse(r.content[0].text);
let failures = 0;
const expect = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  [${ok ? "ok" : "FAIL"}] ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const { tools } = await client.listTools();
expect("tools listed", tools.map((t) => t.name).sort(), ["check_title_files", "measure_titles"]);

const SAMPLE = "家常料理食譜站｜滷肉飯做法・便當菜色・120道快速晚餐";
const CUT = "一二三四五六七八九十百千萬甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午";
const TAIL = ["番茄炒蛋怎麼做：新手也能做的家常菜", "馬鈴薯燉肉怎麼做：新手也能做的家常菜", "麻婆豆腐怎麼做：新手也能做的家常菜"];

const r1 = parse(await client.callTool({ name: "measure_titles", arguments: { titles: [SAMPLE, CUT, ...TAIL] } }));
expect("set with a cut title gets verdict fix", r1.verdict, "fix");
expect("sample title px", r1.results[0].px, 564.6);
expect("sample title tier", r1.results[0].tier, "safe");
expect("sample title has no fails", r1.results[0].fails, []);
expect("30 distinct ideographs tier", r1.results[1].tier, "cut");
expect("30 distinct ideographs fail rule", r1.results[1].fails.map((f) => f.rule), ["length_cut"]);
expect("boilerplate tail found across 3 titles", r1.boilerplate_tails, [{ tail: "新手也能做的家常菜", count: 3 }]);
expect("model date is reported", r1.model.measured_on, "2026-09-18");

const r2 = parse(await client.callTool({ name: "measure_titles", arguments: { titles: [SAMPLE, ...TAIL.slice(0, 2)] } }));
expect("same tail on 2 titles passes", r2.verdict, "pass");

const dir = mkdtempSync(join(tmpdir(), "stw-smoke-"));
try {
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "index.html"), `<html><head><title>${SAMPLE}</title></head></html>`);
  writeFileSync(join(dir, "sub", "long.htm"), `<html><head><TITLE>\n ${CUT} \n</TITLE></head></html>`);
  writeFileSync(join(dir, "sub", "notes.txt"), `<title>${CUT}</title>`);
  const r3 = parse(await client.callTool({ name: "check_title_files", arguments: { paths: [dir] } }));
  expect("directory scan finds .html and .htm, ignores .txt", r3.total, 2);
  expect("directory scan verdict", r3.verdict, "fix");
  expect("failing file is the .htm one", r3.results.filter((x) => x.fails.length).map((x) => x.src.endsWith("long.htm")), [true]);

  const r4 = await client.callTool({ name: "check_title_files", arguments: { paths: [join(dir, "does-not-exist")] } });
  expect("missing path is an error, not a pass", r4.isError === true, true);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

await client.close();
console.log(failures ? `\n${failures} smoke check(s) failed` : "\nall smoke checks passed");
process.exit(failures ? 1 : 0);
