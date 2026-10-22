/**
 * Positive and negative controls for the ruler.
 *
 * Every rule is tested twice: once on an input it must flag, once on a
 * near-identical input it must not. A check that has only been shown to pass
 * clean input has not been shown to work. The CLI runs this before printing
 * any verdict and the MCP server refuses to start if it fails.
 *
 * Expected pixel values were computed with the original Python implementation
 * of the same model, so they also pin the TypeScript port to it.
 */

import {
  EM, SAFE, px, tier, checkOne, boilerplateTails, type RuleId, type Verdict,
} from "./rules.js";
import { extractTitle } from "./files.js";

/** Neutral sample title: 24 full-width characters and 3 digits. */
export const SAMPLE_TITLE = "家常料理食譜站｜滷肉飯做法・便當菜色・120道快速晚餐";
/** px(SAMPLE_TITLE) as computed by the Python original (repr of the float). */
export const SAMPLE_PX = 564.5999999999999;

/** 30 different ideographs, so length controls cannot trip the stuffing rule. */
const DISTINCT = "一二三四五六七八九十百千萬甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午";

const has = (v: Verdict, kind: "fails" | "warns", rule: RuleId) => v[kind].some((f) => f.rule === rule);
const clean = (v: Verdict) => v.fails.length === 0 && v.warns.length === 0;

interface Check { name: string; ok: () => boolean; }

const CHECKS: Check[] = [
  // Width model
  { name: "26 full-width characters measure exactly 572px (the safe line)", ok: () => px("測".repeat(26)) === SAFE },
  { name: "26 full-width characters are tier safe, not long (boundary, must not flag)", ok: () => tier(px("測".repeat(26))) === "safe" },
  { name: "27 distinct full-width characters (594px) are tier long: a warning, not a fail", ok: () => {
    const v = checkOne(DISTINCT.slice(0, 27));
    return tier(px(DISTINCT.slice(0, 27))) === "long" && has(v, "warns", "length_long") && v.fails.length === 0;
  } },
  { name: "29 distinct full-width characters (638px) fail as edge, not cut", ok: () => {
    const v = checkOne(DISTINCT.slice(0, 29));
    return has(v, "fails", "length_edge") && !has(v, "fails", "length_cut");
  } },
  { name: "30 distinct full-width characters (660px) fail as cut", ok: () =>
    tier(px(DISTINCT.slice(0, 30))) === "cut" && has(checkOne(DISTINCT.slice(0, 30)), "fails", "length_cut") },
  { name: "27 copies of one character also fail as stuffing (repeated 4-character runs)", ok: () => has(checkOne("測".repeat(27)), "fails", "stuffing") },
  { name: `neutral sample title measures ${SAMPLE_PX}px, same float as the Python original`, ok: () => px(SAMPLE_TITLE) === SAMPLE_PX },
  { name: "neutral sample title has no fail (must not flag)", ok: () => checkOne(SAMPLE_TITLE).fails.length === 0 },
  { name: "an emoji outside the BMP is one full-width character (22px), not two half-width units", ok: () => px("\u{1F35C}") === EM },
  { name: "half-width table applies: 'i' is 4.89px, '0' falls back to 12.2px", ok: () => px("i") === 4.89 && px("0") === 12.2 },
  { name: "half-width katakana (East Asian Width H) is not full width: 12.2px", ok: () => px("\uFF71") === 12.2 },
  { name: "ideographic space (East Asian Width F) is full width: 22px", ok: () => px("\u3000") === EM },

  // Separators
  { name: "3 separators (、) fail", ok: () => has(checkOne("台北咖啡廳推薦、甜點、早午餐、插座座位整理"), "fails", "separators") },
  { name: "2 separators pass (must not flag)", ok: () => !has(checkOne("台北咖啡廳推薦、甜點、早午餐整理"), "fails", "separators") },

  // Question marks
  { name: "2 full-width question marks fail", ok: () => has(checkOne("第一次去京都要住哪？住幾晚？"), "fails", "question_marks") },
  { name: "1 full-width question mark passes (must not flag)", ok: () => checkOne("第一次去京都要住哪？").fails.length === 0 },

  // Boilerplate tails across a set
  { name: "same tail on 3 titles fails on each of them", ok: () => {
    const set = ["番茄炒蛋怎麼做：新手也能做的家常菜", "馬鈴薯燉肉怎麼做：新手也能做的家常菜", "麻婆豆腐怎麼做：新手也能做的家常菜"];
    const b = boilerplateTails(set);
    return set.every((t) => has(checkOne(t, b), "fails", "boilerplate_tail"));
  } },
  { name: "same tail on 2 titles passes (must not flag)", ok: () => {
    const set = ["番茄炒蛋怎麼做：新手也能做的家常菜", "馬鈴薯燉肉怎麼做：新手也能做的家常菜"];
    const b = boilerplateTails(set);
    return b.size === 0 && set.every((t) => checkOne(t, b).fails.length === 0);
  } },

  // Keyword stuffing
  { name: "the same ideograph run 3 times fails as stuffing", ok: () => has(checkOne("便當菜｜便當菜｜便當菜 一週菜單"), "fails", "stuffing") },
  { name: "the same run twice passes (must not flag)", ok: () => checkOne("便當菜｜便當菜 一週菜單").fails.length === 0 },

  // Keyword zone (mobile first line)
  { name: "keyword zone wider than the mobile first line is a warning, not a fail", ok: () => {
    const v = checkOne("京都自由行三天兩夜行程規劃與交通住宿整理");
    return has(v, "warns", "keyword_zone") && v.fails.length === 0;
  } },
  { name: "the same words split after the keyword are clean (must not flag)", ok: () => clean(checkOne("京都自由行：三天兩夜行程規劃與交通住宿整理")) },

  // Empty titles
  { name: "empty title fails", ok: () => has(checkOne(""), "fails", "empty") },
  { name: "title of only an ideographic space fails as empty", ok: () => has(checkOne("\u3000"), "fails", "empty") },
  { name: "a short clean title passes with no fail and no warning", ok: () => clean(checkOne("京都三天兩夜行程")) },

  // Reading titles from HTML
  { name: "reads <title> case-insensitively, decodes &amp;, collapses whitespace", ok: () =>
    extractTitle("<html><head><TITLE lang=\"zh-TW\">\n  Tom &amp; Jerry\n  </TITLE></head></html>") === "Tom & Jerry" },
  { name: "a document without <title> yields no title (must not invent one)", ok: () => extractTitle("<html><h1>x</h1></html>") === null },
];

export function run(log: (s: string) => void = console.log): boolean {
  let passed = 0, failed = 0;
  for (const c of CHECKS) {
    let ok = false;
    try { ok = c.ok(); } catch { ok = false; }
    ok ? passed++ : failed++;
    log(`  [${ok ? "ok" : "FAIL"}] ${c.name}`);
  }
  log(failed
    ? `  ${passed} passed, ${failed} failed. The ruler is broken; do not trust its output.`
    : `  ${passed} passed, 0 failed. Positive and negative controls agree.`);
  return failed === 0;
}

if (process.argv[1] && /selftest\.js$/.test(process.argv[1])) {
  process.exit(run() ? 0 : 2);
}
