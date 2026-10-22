/**
 * Parity check against the Python reference implementation of the same model.
 *
 *   node scripts/parity.mjs --ref /path/to/title_check.py [--python python3] [--json out.json] [--verbose]
 *
 * The reference is imported by path and must expose px(), tail_of(),
 * check_one() and the EM/SAFE/EDGE/HARD/FIRST_LINE/HALF constants.
 *
 * This package deliberately diverges from the reference (full ASCII width
 * table, zero-width characters and grapheme clusters, no colon tails, separator
 * tiers). The shipped code can be switched back to the reference's behaviour
 * with LEGACY_RULES, so the check has two halves:
 *
 *   1. LEGACY_RULES against the Python reference, which must agree exactly:
 *      (a1) px() of every code point U+0020-U+FFFF except surrogates; the only
 *           allowed differences come from different Unicode data, grouped
 *           into ranges with the cause;
 *      (b1) px(), boilerplate tail and the ordered failed/warned rules for
 *           290 mixed titles, with boilerplate detected across the set.
 *   2. DEFAULT_RULES against LEGACY_RULES: every difference, for code points
 *      (a2) and titles (b2), must be attributable to a named cause.
 *
 * Exit 0 when both halves hold; 1 otherwise; 2 on bad arguments.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");
const {
  px, tailOf, checkOne, boilerplateTails, isZeroWidth, EM, SAFE, EDGE, HARD, FIRST_LINE, LEGACY_HALF, ASCII_PX,
  DEFAULT_RULES, LEGACY_RULES,
} =
  await import(new URL("file:///" + resolve(dist, "rules.js").replace(/\\/g, "/")).href);
const { eastAsianWidthType } = await import("get-east-asian-width");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const REF = arg("--ref", process.env.TITLE_CHECK_PY);
const PY = arg("--python", process.env.PYTHON || "python");
const JSON_OUT = arg("--json", null);
if (!REF) {
  console.error("usage: node scripts/parity.mjs --ref /path/to/title_check.py [--python python3] [--json out.json]");
  process.exit(2);
}

// ---------------------------------------------------------------- titles
const cp = (...n) => String.fromCodePoint(...n);

const HANDCRAFTED = [
  // Traditional Chinese
  "家常料理食譜站｜滷肉飯做法・便當菜色・120道快速晚餐",
  "台北一日遊行程推薦：捷運就能到的10個景點",
  "2026 台中美食地圖｜在地人推薦的早午餐、咖啡廳",
  "新手露營裝備清單：帳篷、睡袋、爐具怎麼挑？",
  "花蓮自由行怎麼排？三天兩夜交通與住宿整理",
  "氣炸鍋食譜｜雞翅、薯條、烤蔬菜 15 分鐘上桌",
  "日月潭環湖自行車路線：距離、坡度、租車資訊",
  "阿里山日出攻略？小火車訂票、時刻表、穿搭一次看",
  "iPhone 16 拍照技巧：夜景模式、人像模式設定教學",
  "咖啡豆怎麼保存？冷凍、密封罐、真空袋比較",
  "台南小吃推薦｜牛肉湯、虱目魚粥、碗粿在地老店",
  "高雄駁二藝術特區一日散步路線",
  "宜蘭溫泉旅館推薦：礁溪、蘇澳冷泉、親子湯屋",
  "烤箱烤地瓜幾分鐘？溫度與時間對照表",
  "墾丁浮潛地點整理、裝備租借、注意事項、最佳季節",
  "什麼是手沖咖啡？什麼是義式咖啡？差在哪？",
  "便當菜｜便當菜｜便當菜 一週菜單",
  "京都賞楓景點京都賞楓時間京都賞楓交通京都賞楓住宿",
  "台灣環島鐵路旅行完整攻略從台北出發經宜蘭花蓮台東屏東高雄台南嘉義台中回到台北的十四天行程",
  "嘉義美食懶人包：雞肉飯、砂鍋魚頭、方塊酥與在地早餐店全收錄",
  "京都三天兩夜行程",
  "番茄炒蛋怎麼做：新手也能做的家常菜",
  "馬鈴薯燉肉怎麼做：新手也能做的家常菜",
  "麻婆豆腐怎麼做：新手也能做的家常菜",
  "台北咖啡廳推薦：在地人私房推薦",
  "台中甜點店推薦：在地人私房推薦",
  // Japanese
  "京都観光ガイド｜嵐山・清水寺・伏見稲荷の回り方",
  "東京駅周辺のランチおすすめ10選【2026年版】",
  "初心者向けパン作りレシピ：強力粉で作る基本の食パン",
  "北海道旅行の持ち物リスト？冬の服装と注意点",
  "大阪グルメまとめ" + cp(0x3000) + "たこ焼き・お好み焼き・串カツ",
  "ｶﾌｪ巡りﾏｯﾌﾟ 2026 ｵｽｽﾒ",
  // Korean
  "서울 맛집 추천 2026｜을지로 노포와 성수동 카페",
  "제주도 여행 코스 3박 4일: 동쪽 해안도로 드라이브",
  "초보자를 위한 홈카페 레시피 10가지",
  "부산 해운대 숙소 추천? 가성비 호텔 비교",
  // Latin and mixed
  "How to Brew Pour-Over Coffee at Home",
  "Tokyo Travel Guide 2026 | Best Ramen, Sushi & Cafes",
  "WWW Mmm iiii llll ---- .... wwww",
  "USB-C 充電線怎麼選？100W、PD、QC 規格比較",
  "Wi-Fi 6E 路由器推薦｜TP-Link、ASUS、Netgear 實測",
  "ＡＢＣ英文學習網｜１２３數字教學",
  "Caf" + cp(0x65, 0x301) + " cr" + cp(0x65, 0x300) + "me br" + cp(0x75, 0x302) + "l" + cp(0x65, 0x301) + "e 甜點教學",
  "①②③ 步驟教學 ○× 判斷 ※注意",
  "→ 交通方式 ← 回程…～〜",
  // Emoji
  "🍜 拉麵控必看｜東京拉麵排行榜 TOP 20 🍥",
  "☕ 咖啡新手入門：從磨豆到萃取 ✨",
  "👨‍👩‍👧 親子旅遊推薦：台灣 5 大親子景點",
  "❤️ 情人節晚餐食譜：簡單又浪漫的 3 道料理",
  "🇯🇵 日本自由行懶人包｜簽證、網卡、交通卡",
  // Empty and whitespace edge cases (Python str.isspace() vs JavaScript trim())
  "", " ", cp(0x3000), cp(0xa0), cp(0x1c), cp(0x85), cp(0xfeff), cp(0x200b), "\t\n",
  "結尾換行的標題：這是一段夠長的結尾\n",
  // Cases for the deliberate divergences from the reference
  "旗艦手機開箱｜SAMSUNG GALAXY S26 ULTRA VS GOOGLE PIXEL",
  "番茄炒蛋怎麼做：家常料理食譜站", "馬鈴薯燉肉怎麼做：家常料理食譜站", "麻婆豆腐怎麼做：家常料理食譜站",
  "台北咖啡廳推薦、甜點、早午餐、插座座位整理",
  "京都" + cp(0x200b) + "三天兩夜" + cp(0xfeff) + "行程" + cp(0x200b).repeat(5),
  cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467) + " 親子景點" + cp(0x2764, 0xfe0f) + "推薦",
];

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260918);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const POOLS = {
  zh: ["滷肉飯做法", "三天兩夜行程", "新手入門指南", "價格比較", "最新整理", "交通方式", "營業時間", "必吃清單",
    "預算規劃", "常見問題", "推薦路線", "保存方法", "季節限定", "住宿推薦", "免費景點", "親子景點", "雨天備案",
    "在地老店", "手沖咖啡", "登山步道", "單車環島", "夜市小吃", "溫泉旅館", "賞櫻時間", "露營裝備", "早午餐",
    "便當菜", "甜點店", "老街散步", "博物館", "台北", "台中", "台南", "高雄", "花蓮", "台東"],
  ja: ["京都観光ガイド", "東京グルメまとめ", "初心者向けレシピ", "おすすめ", "ランキング", "完全ガイド", "旅行プラン",
    "カフェ巡り", "温泉旅館", "モデルコース", "持ち物リスト", "アクセス"],
  ko: ["서울 맛집 추천", "제주도 여행 코스", "초보자 가이드", "최신 정보", "가성비 카페", "주말 나들이", "숙소 추천", "교통 안내"],
  en: ["Travel Guide", "Best Ramen", "Step-by-step", "How to", "Wi-Fi", "USB-C", "DIY", "Top 10", "Itinerary",
    "Budget Tips", "FAQ", "iPhone", "Mt. Ali", "Weekend Trip"],
  emoji: ["🍜", "☕", "🚄", "✨", "🇹🇼", "👨‍👩‍👧", "❤️", "⛰️", "🌸", "📍"],
  punct: ["「", "」", "【", "】", "（", "）", "！", "…", "～", "※"],
};
const SEPS = ["｜", "・", "：", "、", "，", " | ", " - ", "？", " ", "", "、", "，", "？"];
const TAILS = ["：完整攻略與注意事項", "，新手一次看懂全部", "、在地人推薦清單"];

const GENERATED = [];
for (let i = 0; i < 220; i++) {
  const lang = pick(["zh", "zh", "zh", "zh", "ja", "ko", "en"]);
  const n = 1 + Math.floor(rnd() * 5);
  const parts = [];
  for (let k = 0; k < n; k++) {
    let seg = pick(rnd() < 0.8 ? POOLS[lang] : POOLS[pick(["zh", "ja", "ko", "en"])]);
    if (rnd() < 0.2) seg = String(Math.floor(rnd() * 3000)) + seg;
    if (rnd() < 0.1) seg = pick(POOLS.punct) + seg;
    parts.push(seg);
  }
  let t = parts[0];
  for (let k = 1; k < parts.length; k++) t += pick(SEPS) + parts[k];
  if (rnd() < 0.15) t = pick(POOLS.emoji) + " " + t;
  if (rnd() < 0.1) { const s = pick(POOLS.zh); t = [s, s, s].join(pick(["｜", " ", "・"])) + t; }
  if (rnd() < 0.12) t += pick(TAILS);
  if (rnd() < 0.08) t = t + t;
  GENERATED.push(t);
}

const TITLES = [...HANDCRAFTED, ...GENERATED];

// ---------------------------------------------------------------- reference
const HELPER = [
  "import sys, json, importlib.util, unicodedata",
  "from collections import Counter",
  "spec = importlib.util.spec_from_file_location('title_check_ref', sys.argv[1])",
  "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  "data = json.loads(sys.stdin.buffer.read().decode('utf-8'))",
  "lo, hi = data['range']",
  "cps = [c for c in range(lo, hi + 1) if not (0xD800 <= c <= 0xDFFF)]",
  "RULES = [('必砍', 'length_cut'), ('過長', 'length_edge'), ('偏長', 'length_long'), ('分隔符', 'separators'),",
  "         ('問號', 'question_marks'), ('樣板結尾', 'boilerplate_tail'), ('關鍵字區', 'keyword_zone'),",
  "         ('空標題', 'empty'), ('關鍵字堆砌', 'stuffing')]",
  "def rule(msg):",
  "    for prefix, rid in RULES:",
  "        if msg.startswith(prefix): return rid",
  "    return 'UNMAPPED:' + msg",
  "titles = data['titles']",
  "tails = Counter(t for ti in titles for t in [m.tail_of(ti)] if t)",
  "boiler = {k for k, v in tails.items() if v > 2}",
  "res = []",
  "for t in titles:",
  "    f, w = m.check_one(t, boiler)",
  "    res.append({'px': m.px(t), 'tail': m.tail_of(t), 'fails': [rule(x) for x in f], 'warns': [rule(x) for x in w]})",
  "out = {",
  "  'python': sys.version.split()[0], 'unidata': unicodedata.unidata_version,",
  "  'constants': {'EM': m.EM, 'SAFE': m.SAFE, 'EDGE': m.EDGE, 'HARD': m.HARD, 'FIRST_LINE': m.FIRST_LINE, 'HALF': m.HALF},",
  "  'cps': cps, 'cp_px': [m.px(chr(c)) for c in cps],",
  "  'cp_eaw': [unicodedata.east_asian_width(chr(c)) for c in cps],",
  "  'cp_cat': [unicodedata.category(chr(c)) for c in cps],",
  "  'cp_printable': [chr(c).isprintable() for c in cps],",
  "  'boiler': sorted(boiler), 'titles': res,",
  "}",
  "sys.stdout.buffer.write(json.dumps(out, ensure_ascii=True).encode('ascii'))",
].join("\n");

const run = spawnSync(PY, ["-c", HELPER, REF], {
  input: JSON.stringify({ range: [0x20, 0xffff], titles: TITLES }),
  maxBuffer: 256 * 1024 * 1024,
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
if (run.status !== 0) {
  console.error("reference failed:\n" + String(run.stderr));
  process.exit(2);
}
const ref = JSON.parse(String(run.stdout));

// ---------------------------------------------------------------- compare
// Two comparisons:
//   1. This package with LEGACY_RULES (switched to the reference's behaviour)
//      against the Python reference. Must be identical, apart from code points
//      whose Unicode data differs between the two runtimes.
//   2. DEFAULT_RULES against LEGACY_RULES. Every difference must come from one
//      of the deliberate changes listed in CAUSES.
const CAUSES = [
  { id: "ascii-width", key: "asciiTable", why: "measured Arial widths for all printable ASCII (the reference had 14, with W wrong)" },
  { id: "zero-width", key: "graphemes", why: "zero-width characters count 0 and each grapheme cluster counts once" },
  { id: "colon-tail", key: "colonTail", why: "a phrase after a colon is no longer a boilerplate tail" },
  { id: "separator-tier", key: "separatorTier", why: "more than 2 separators only warn within the 572px safe line" },
];
const flip = (base, key) => Object.freeze({ ...base, [key]: !base[key] });

const report = { python: ref.python, python_unicode: ref.unidata, node_unicode: process.versions.unicode };
let problems = 0;

// The reference has had two half-width tables: 14 values (first port), and
// later the same 95 measured Arial advances as this package. Detect which one
// it uses, and compare against a baseline with that setting.
const sameTable = (obj, map) => Object.keys(obj).length === map.size && [...map].every(([k, v]) => obj[k] === v);
const refAscii = sameTable(ref.constants.HALF, ASCII_PX) ? "full" : sameTable(ref.constants.HALF, LEGACY_HALF) ? "legacy" : "unknown";
const BASE = Object.freeze({ ...LEGACY_RULES, asciiTable: refAscii === "full" });
const ACTIVE = CAUSES.filter((c) => BASE[c.key] !== DEFAULT_RULES[c.key]);
report.reference_ascii_table = refAscii;

// Constants of the reference against this package
const tsConst = { EM, SAFE, EDGE, HARD, FIRST_LINE };
const refConst = { EM: ref.constants.EM, SAFE: ref.constants.SAFE, EDGE: ref.constants.EDGE, HARD: ref.constants.HARD, FIRST_LINE: ref.constants.FIRST_LINE };
const constOk = JSON.stringify(tsConst) === JSON.stringify(refConst) && refAscii !== "unknown";
if (!constOk) problems++;
report.constants_identical = constOk;

// (a1) Code points: legacy mode against Python
const TS_TYPE = { wide: "W", fullwidth: "F", halfwidth: "H", narrow: "Na", ambiguous: "A", neutral: "N" };
const jsPrintable = (c) => c === 0x20 || !/[\p{C}\p{Z}]/u.test(cp(c));
const diffs = [];
let printableTotal = 0, printableDiff = 0;
for (let i = 0; i < ref.cps.length; i++) {
  const c = ref.cps[i];
  const printable = ref.cp_printable[i] || jsPrintable(c);
  if (printable) printableTotal++;
  const t = px(cp(c), BASE);
  if (t !== ref.cp_px[i]) {
    if (printable) printableDiff++;
    diffs.push({
      cp: c, py_px: ref.cp_px[i], ts_px: t, py_eaw: ref.cp_eaw[i], ts_eaw: TS_TYPE[eastAsianWidthType(c)],
      py_cat: ref.cp_cat[i], node_assigned: !/\p{Cn}/u.test(cp(c)), printable,
    });
  }
}
const hex = (n) => "U+" + n.toString(16).toUpperCase().padStart(4, "0");
// Every difference must fall into one of three known causes; anything else is a bug.
function explain(d) {
  if (d.py_cat === "Cn" && !d.node_assigned)
    return { kind: "unassigned", text: `unassigned in Unicode ${ref.unidata} and in Node's Unicode ${process.versions.unicode}; CPython before 3.12 reports ${d.py_eaw} for unassigned code points (3.12 reports N), the npm table follows the UAX #11 default ${d.ts_eaw}` };
  if (d.py_cat === "Cn")
    return { kind: "newer", text: `assigned after Unicode ${ref.unidata} (Python sees it as unassigned and reports ${d.py_eaw}); the npm table gives ${d.ts_eaw}` };
  if (d.py_eaw !== d.ts_eaw)
    return { kind: "changed", text: `East Asian Width changed after Unicode ${ref.unidata}: ${d.py_eaw} there, ${d.ts_eaw} in the npm table` };
  return { kind: "unexplained", text: "same East Asian Width on both sides but different px: implementation bug" };
}
const ranges = [];
for (const d of diffs) {
  const key = [d.py_px, d.ts_px, d.py_eaw, d.ts_eaw, d.py_cat === "Cn", d.node_assigned].join("|");
  const last = ranges[ranges.length - 1];
  if (last && last.key === key && last.end === d.cp - 1) { last.end = d.cp; last.count++; }
  else ranges.push({ key, start: d.cp, end: d.cp, count: 1, d });
}
const tally = (xs, f) => xs.reduce((acc, x) => { const k = f(x); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
report.codepoints_legacy_vs_python = {
  compared: ref.cps.length, printable: printableTotal,
  differ_total: diffs.length, differ_printable: printableDiff,
  by_cause: tally(diffs, (d) => explain(d).kind),
  printable_by_cause: tally(diffs.filter((d) => d.printable), (d) => explain(d).kind),
  unexplained: diffs.filter((d) => explain(d).kind === "unexplained").length,
  ranges: ranges.map((r) => ({
    range: r.start === r.end ? hex(r.start) : `${hex(r.start)}-${hex(r.end)}`, count: r.count,
    python_px: r.d.py_px, ts_px: r.d.ts_px, cause: explain(r.d).text, kind: explain(r.d).kind,
    assigned_in_node_unicode: r.d.node_assigned,
  })),
};
if (report.codepoints_legacy_vs_python.unexplained) problems++;

// (a2) Code points: default against legacy
const cpDiv = [];
for (const c of ref.cps) {
  const d = px(cp(c), DEFAULT_RULES), l = px(cp(c), BASE);
  if (d === l) continue;
  const cause = c >= 0x20 && c <= 0x7e && !BASE.asciiTable ? "ascii-width" : isZeroWidth(c) ? "zero-width" : "unexplained";
  cpDiv.push({ cp: hex(c), legacy: l, now: d, cause });
}
report.codepoints_default_vs_legacy = {
  differ: cpDiv.length, by_cause: tally(cpDiv, (d) => d.cause),
  unexplained: cpDiv.filter((d) => d.cause === "unexplained").length,
  samples: cpDiv.filter((d) => ["U+0057", "U+0030", "U+0020", "U+200B", "U+FE0F"].includes(d.cp)),
};
if (report.codepoints_default_vs_legacy.unexplained) problems++;

// (b1) Titles: legacy mode against Python
const ids = (xs) => xs.map((x) => x.rule);
const evalSet = (o) => {
  const b = boilerplateTails(TITLES, o);
  return TITLES.map((t) => { const v = checkOne(t, b, o); return { px: px(t, o), tail: tailOf(t, o), fails: ids(v.fails), warns: ids(v.warns) }; });
};
const L = evalSet(BASE);
const boilerOk = JSON.stringify([...boilerplateTails(TITLES, BASE).keys()].sort()) === JSON.stringify(ref.boiler);
if (!boilerOk) problems++;
let pxMismatch = 0, verdictMismatch = 0, tailMismatch = 0;
const mismatches = [];
const ruleHits = {};
for (let i = 0; i < TITLES.length; i++) {
  const r = ref.titles[i], l = L[i];
  for (const id of [...r.fails, ...r.warns]) ruleHits[id] = (ruleHits[id] ?? 0) + 1;
  const pOk = l.px === r.px, tOk = (l.tail ?? null) === r.tail;
  const vOk = JSON.stringify([l.fails, l.warns]) === JSON.stringify([r.fails, r.warns]);
  if (!pOk) pxMismatch++;
  if (!tOk) tailMismatch++;
  if (!vOk) verdictMismatch++;
  if (!pOk || !tOk || !vOk) mismatches.push({ title: TITLES[i], ts_legacy: l, py: r });
}
problems += pxMismatch + verdictMismatch + tailMismatch;
report.titles_legacy_vs_python = {
  compared: TITLES.length, handcrafted: HANDCRAFTED.length, generated: GENERATED.length,
  px_mismatches: pxMismatch, tail_mismatches: tailMismatch, verdict_mismatches: verdictMismatch,
  boilerplate_sets_identical: boilerOk, boilerplate_tails: ref.boiler,
  titles_failing_in_python: ref.titles.filter((r) => r.fails.length).length,
  rule_hits_in_python: ruleHits, mismatches: mismatches.slice(0, 20),
};

// (b2) Titles: default against legacy, attributed to causes. A cause touches a
// title when switching it on alone (from legacy) or off alone (from default)
// changes that title's result.
const D = evalSet(DEFAULT_RULES);
const S = Object.fromEntries(ACTIVE.map((c) => [c.id, evalSet(flip(BASE, c.key))]));
const O = Object.fromEntries(ACTIVE.map((c) => [c.id, evalSet(flip(DEFAULT_RULES, c.key))]));
const all = (r) => JSON.stringify(r);
const verdict = (r) => JSON.stringify([r.fails, r.warns]);
const status = (r) => (r.fails.length ? "fail" : "pass");
const div = { results_differ: 0, verdicts_differ: 0, pass_fail_flips: 0, unexplained: 0,
  by_cause: {}, verdict_by_cause: {}, flips_by_cause: {}, examples: {} };
for (let i = 0; i < TITLES.length; i++) {
  if (all(D[i]) === all(L[i])) continue;
  div.results_differ++;
  const vd = verdict(D[i]) !== verdict(L[i]);
  const fl = status(D[i]) !== status(L[i]);
  if (vd) div.verdicts_differ++;
  if (fl) div.pass_fail_flips++;
  const touched = ACTIVE.filter((c) => all(S[c.id][i]) !== all(L[i]) || all(O[c.id][i]) !== all(D[i]));
  if (!touched.length) { div.unexplained++; continue; }
  for (const c of touched) {
    div.by_cause[c.id] = (div.by_cause[c.id] ?? 0) + 1;
    const cv = verdict(S[c.id][i]) !== verdict(L[i]) || verdict(O[c.id][i]) !== verdict(D[i]);
    if (vd && cv) {
      div.verdict_by_cause[c.id] = (div.verdict_by_cause[c.id] ?? 0) + 1;
      (div.examples[c.id] ??= []).length < 2 && div.examples[c.id].push({
        title: TITLES[i], before: { px: +L[i].px.toFixed(1), fails: L[i].fails, warns: L[i].warns },
        after: { px: +D[i].px.toFixed(1), fails: D[i].fails, warns: D[i].warns },
      });
    }
    if (fl && cv) div.flips_by_cause[c.id] = (div.flips_by_cause[c.id] ?? 0) + 1;
  }
}
problems += div.unexplained;
report.titles_default_vs_legacy = div;

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));

console.log(`reference: Python ${ref.python}, unicodedata ${ref.unidata}; Node ${process.version}, ICU Unicode ${process.versions.unicode}`);
console.log(`constants identical: ${constOk}; reference half-width table: ${refAscii === "full" ? "the same 95 measured Arial advances as this package" : refAscii === "legacy" ? "the old 14-value table" : "UNKNOWN"}`);
console.log(`baseline = this package switched to the reference's behaviour: ${JSON.stringify(BASE)}`);
const c = report.codepoints_legacy_vs_python;
console.log(`(a1) code points U+0020-U+FFFF without surrogates, baseline vs Python: ${c.compared} compared, ${c.printable} printable`);
console.log(`     px differs on ${c.differ_total} (${c.differ_printable} printable), ${c.ranges.length} ranges; unexplained: ${c.unexplained}`);
console.log(`     by cause (all): ${JSON.stringify(c.by_cause)}; printable only: ${JSON.stringify(c.printable_by_cause)}`);
const VERBOSE = process.argv.includes("--verbose");
for (const r of c.ranges) if (VERBOSE || r.kind !== "unassigned") console.log(`       ${r.range.padEnd(14)} x${String(r.count).padEnd(5)} py ${r.python_px} / ts ${r.ts_px}  ${r.cause}`);
if (!VERBOSE) console.log(`       (${c.ranges.filter((r) => r.kind === "unassigned").length} ranges of unassigned code points not listed; --verbose lists them, --json saves all)`);
const cd = report.codepoints_default_vs_legacy;
console.log(`(a2) code points, DEFAULT vs baseline: ${cd.differ} differ, by cause ${JSON.stringify(cd.by_cause)}, unexplained: ${cd.unexplained}`);
for (const s of cd.samples) console.log(`       ${s.cp.padEnd(8)} legacy ${s.legacy} -> now ${s.now} (${s.cause})`);
const t = report.titles_legacy_vs_python;
console.log(`(b1) titles, baseline vs Python: ${t.compared} compared (${t.handcrafted} handcrafted, ${t.generated} generated)`);
console.log(`     px mismatches ${t.px_mismatches}, tail mismatches ${t.tail_mismatches}, verdict mismatches ${t.verdict_mismatches}, boilerplate sets identical ${t.boilerplate_sets_identical}`);
console.log(`     titles failing in Python: ${t.titles_failing_in_python}; rule hits: ${JSON.stringify(t.rule_hits_in_python)}`);
for (const m of t.mismatches) console.log("     MISMATCH " + JSON.stringify(m));
console.log(`(b2) titles, DEFAULT vs baseline: ${div.results_differ} results differ, ${div.verdicts_differ} verdicts differ, ${div.pass_fail_flips} flip between pass and fail; unexplained: ${div.unexplained}`);
for (const cz of CAUSES) {
  if (!ACTIVE.includes(cz)) { console.log(`     ${cz.id.padEnd(15)} not a divergence: the reference already does this`); continue; }
  console.log(`     ${cz.id.padEnd(15)} touches ${String(div.by_cause[cz.id] ?? 0).padStart(3)} results, ${String(div.verdict_by_cause[cz.id] ?? 0).padStart(3)} verdicts, ${String(div.flips_by_cause[cz.id] ?? 0).padStart(3)} pass/fail flips  (${cz.why})`);
  for (const e of div.examples[cz.id] ?? []) console.log(`       e.g. ${e.title}\n            before ${JSON.stringify(e.before)}\n            after  ${JSON.stringify(e.after)}`);
}
console.log(problems ? `\nPARITY FAILED (${problems} problem(s))` : "\nparity OK: the baseline matches the reference, and every divergence has a named cause");
process.exit(problems ? 1 : 0);
