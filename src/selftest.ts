/**
 * Positive and negative controls for the ruler.
 *
 * Every rule is tested twice: once on an input it must flag, once on a
 * near-identical input it must not. A check that has only been shown to pass
 * clean input has not been shown to work. The CLI runs this before printing
 * any verdict and the MCP server refuses to start if it fails.
 *
 * Checks marked [fix N] were added with the fix they cover and fail on the
 * build before it. They only call functions that existed in the first release
 * (px, tier, checkOne, boilerplateTails, extractTitle), so they can be run
 * against an older build to show that.
 */

import { EM, SAFE, px, tier, checkOne, boilerplateTails, type RuleId, type Verdict } from "./rules.js";
import { extractTitle } from "./files.js";

const cp = (...n: number[]) => String.fromCodePoint(...n);

/** Neutral sample title: 24 full-width characters and 3 digits. */
export const SAMPLE_TITLE = "家常料理食譜站｜滷肉飯做法・便當菜色・120道快速晚餐";
/** 24 x 22px + 3 digits x (1139 / 2048 x 22px). Exact in binary floating point. */
export const SAMPLE_PX = 564.7060546875;
/** Reviewer's example: Latin capitals are much wider than 12.2px. */
export const CAPS_TITLE = "旗艦手機開箱｜SAMSUNG GALAXY S26 ULTRA VS GOOGLE PIXEL";

/** 30 different ideographs, so length controls cannot trip the stuffing rule. */
const DISTINCT = "一二三四五六七八九十百千萬甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午";

const has = (v: Verdict, kind: "fails" | "warns", rule: RuleId) => v[kind].some((f) => f.rule === rule);
const clean = (v: Verdict) => v.fails.length === 0 && v.warns.length === 0;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const units = (u: number) => (u * 22) / 2048;

interface Check { name: string; ok: () => boolean; }

const CHECKS: Check[] = [
  // Width model: full-width characters and tiers
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
  { name: "ideographic space (East Asian Width F) is full width: 22px", ok: () => px(cp(0x3000)) === EM },
  { name: "an emoji outside the BMP is one full-width character (22px), not two half-width units", ok: () => px(cp(0x1f35c)) === EM },

  // [fix 1] Measured Arial advances for all printable ASCII
  { name: "[fix 1] W is Arial's 1933 units = 20.76px (browser canvas: 20.76), not 18.33", ok: () => px("W") === units(1933) && near(px("W"), 20.76, 0.01) },
  { name: "[fix 1] A and O match the browser canvas (14.67, 17.11) within 0.01px", ok: () => near(px("A"), 14.67, 0.01) && near(px("O"), 17.11, 0.01) },
  { name: "[fix 1] previously measured advances still hold within 0.01px (space, i, M, w, -)", ok: () =>
    near(px(" "), 6.11, 0.01) && near(px("i"), 4.89, 0.01) && near(px("M"), 18.33, 0.01) && near(px("w"), 15.9, 0.02) && near(px("-"), 7.33, 0.01) },
  { name: "[fix 1] a digit is Arial's 1139 units = 12.2354px", ok: () => px("0") === units(1139) && px("9") === units(1139) },
  { name: `[fix 1] neutral sample title measures ${SAMPLE_PX}px`, ok: () => px(SAMPLE_TITLE) === SAMPLE_PX },
  { name: "neutral sample title has no fail (must not flag)", ok: () => checkOne(SAMPLE_TITLE).fails.length === 0 },
  { name: "[fix 1] all-caps Latin title over 648px fails as cut (was measured at 605.5px and passed)", ok: () =>
    px(CAPS_TITLE) > 648 && tier(px(CAPS_TITLE)) === "cut" && has(checkOne(CAPS_TITLE), "fails", "length_cut") },
  { name: "[fix 1] the same title in lower case stays under the safe line (must not flag length)", ok: () =>
    tier(px("旗艦手機開箱｜samsung galaxy s26 ultra vs google pixel")) === "safe" },
  { name: "non-ASCII half-width characters fall back to 12.2px (precomposed e-acute, half-width katakana)", ok: () =>
    px(cp(0xe9)) === 12.2 && px(cp(0xff71)) === 12.2 },

  // [fix 5a] Zero-width characters and grapheme clusters
  { name: "[fix 5a] five zero width spaces measure 0px", ok: () => px(cp(0x200b).repeat(5)) === 0 },
  { name: "[fix 5a] family emoji (ZWJ sequence of 3 people) is one full-width character", ok: () =>
    px(cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)) === EM },
  { name: "[fix 5a] thumbs up with a skin-tone modifier is one full-width character", ok: () => px(cp(0x1f44d, 0x1f3fd)) === EM },
  { name: "[fix 5a] red heart with emoji presentation selector is one full-width character", ok: () => px(cp(0x2764, 0xfe0f)) === EM },
  { name: "[fix 5a] e followed by a combining acute accent is as wide as e", ok: () => px("e" + cp(0x301)) === px("e") },
  { name: "[fix 5a] zero-width characters inside a title add nothing (must not change the verdict)", ok: () =>
    px("京都" + cp(0x200b) + "三天兩夜" + cp(0xfeff) + "行程") === px("京都三天兩夜行程") },

  // [fix 3] Separators: warning within the safe line, fail above it
  { name: "[fix 3] 3 separators in a 462px title are a warning, not a fail", ok: () => {
    const v = checkOne("台北咖啡廳推薦、甜點、早午餐、插座座位整理");
    return has(v, "warns", "separators") && !has(v, "fails", "separators");
  } },
  { name: "[fix 3] 3 separators in a title over 572px fail", ok: () => {
    const t = "台北咖啡廳推薦、甜點、早午餐、插座座位整理與營業時間地址";
    return px(t) > SAFE && has(checkOne(t), "fails", "separators");
  } },
  { name: "2 separators are neither a warning nor a fail (must not flag)", ok: () => {
    const v = checkOne("台北咖啡廳推薦、甜點、早午餐整理");
    return !has(v, "fails", "separators") && !has(v, "warns", "separators");
  } },

  // Question marks
  { name: "2 full-width question marks fail", ok: () => has(checkOne("第一次去京都要住哪？住幾晚？"), "fails", "question_marks") },
  { name: "1 full-width question mark passes (must not flag)", ok: () => checkOne("第一次去京都要住哪？").fails.length === 0 },

  // Boilerplate tails across a set
  { name: "same tail after ， on 3 titles fails on each of them", ok: () => {
    const set = ["番茄炒蛋怎麼做，新手也能做的家常菜", "馬鈴薯燉肉怎麼做，新手也能做的家常菜", "麻婆豆腐怎麼做，新手也能做的家常菜"];
    const b = boilerplateTails(set);
    return set.every((t) => has(checkOne(t, b), "fails", "boilerplate_tail"));
  } },
  { name: "same tail on 2 titles passes (must not flag)", ok: () => {
    const set = ["番茄炒蛋怎麼做，新手也能做的家常菜", "馬鈴薯燉肉怎麼做，新手也能做的家常菜"];
    const b = boilerplateTails(set);
    return b.size === 0 && set.every((t) => checkOne(t, b).fails.length === 0);
  } },
  { name: "[fix 2] a site name after ： on 3 titles is not boilerplate (Google suggests that pattern)", ok: () => {
    const set = ["番茄炒蛋怎麼做：家常料理食譜站", "馬鈴薯燉肉怎麼做：家常料理食譜站", "麻婆豆腐怎麼做：家常料理食譜站"];
    const b = boilerplateTails(set);
    return b.size === 0 && set.every((t) => !has(checkOne(t, b), "fails", "boilerplate_tail"));
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
  { name: "title of only an ideographic space fails as empty", ok: () => has(checkOne(cp(0x3000)), "fails", "empty") },
  { name: "a short clean title passes with no fail and no warning", ok: () => clean(checkOne("京都三天兩夜行程")) },

  // Reading titles from HTML
  { name: "reads <title> case-insensitively, decodes &amp;, collapses whitespace", ok: () =>
    extractTitle("<html><head><TITLE lang=\"zh-TW\">\n  Tom &amp; Jerry\n  </TITLE></head></html>") === "Tom & Jerry" },
  { name: "a document without <title> yields no title (must not invent one)", ok: () => extractTitle("<html><h1>x</h1></html>") === null },
  { name: "[fix 5b] a commented-out title is ignored; the real one is used", ok: () =>
    extractTitle("<html><head><!-- <title>Old title</title> --><title>Real title</title></head></html>") === "Real title" },
  { name: "[fix 5b] an <svg><title> in the body is not the document title", ok: () =>
    extractTitle("<html><head></head><body><svg><title>icon</title></svg><h1>x</h1></body></html>") === null },
  { name: "[fix 5b] an <svg><title> before the real title is skipped", ok: () =>
    extractTitle("<svg><title>icon</title></svg><title>Real title</title>") === "Real title" },
  { name: "[fix 5b] a <title> inside a head script string is skipped", ok: () =>
    extractTitle("<html><head><script>var s = '<title>fake</title>';</script><title>Real title</title></head></html>") === "Real title" },
  { name: "[fix 5b] a <title> after the head has ended is not the document title", ok: () =>
    extractTitle("<html><head><meta charset=utf-8></head><body><title>late</title></body></html>") === null },
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
