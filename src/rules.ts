/**
 * Title rules. Pure functions: titles in, findings out.
 *
 * A "fail" means the title must be fixed (the CLI exits 1). A "warn" is
 * reported but does not change the exit code.
 */

import { EDGE, FIRST_LINE, HARD, MODEL, SAFE, px, tier, units, type Tier } from "./width.js";

export * from "./width.js";

export type RuleId =
  | "length_cut"
  | "length_edge"
  | "length_long"
  | "separators"
  | "question_marks"
  | "boilerplate_tail"
  | "keyword_zone"
  | "empty"
  | "stuffing";

export interface Finding {
  rule: RuleId;
  message: string;
}

export interface Verdict {
  fails: Finding[];
  warns: Finding[];
}

/** The ideographic comma and the full-width comma. Each is a point where Google can cut a title. */
export const SEPARATORS = ["、", "，"] as const;
export const MAX_SEPARATORS = 2;
export const MAX_QUESTION_MARKS = 1;
/** A trailing phrase must be at least this many characters to count as a boilerplate tail. */
export const TAIL_MIN = 4;
/** A tail shared by more than this many titles in one set is boilerplate. */
export const MAX_SHARED_TAIL = 2;
/** A 2-4 ideograph run repeated this many times is keyword stuffing. */
export const STUFFING_REPEATS = 3;

const TAIL_RE = new RegExp(`[，、：]([^，、：]{${TAIL_MIN},})$`, "u");
const KEYWORD_ZONE_END = /[？：、，]/u;
const IDEOGRAPH_RUN = /[\u4E00-\u9FFF]{2,4}/gu;

/**
 * Whitespace as Python's str.isspace() defines it. Used for the empty-title
 * check and for collapsing whitespace in titles read from HTML, so results
 * match the original implementation exactly. JavaScript's \s and trim() differ:
 * they include U+FEFF and exclude U+001C-U+001F and U+0085.
 */
const WS_CLASS = "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const BLANK_RE = new RegExp(`^[${WS_CLASS}]*$`, "u");
const WS_RUN_RE = new RegExp(`[${WS_CLASS}]+`, "gu");
const WS_EDGE_RE = new RegExp(`^[${WS_CLASS}]+|[${WS_CLASS}]+$`, "gu");

export function isBlank(s: string): boolean {
  return BLANK_RE.test(s);
}

/** Collapse whitespace runs to one space and trim, with Python's definition of whitespace. */
export function normalizeWhitespace(s: string): string {
  return s.replace(WS_RUN_RE, " ").replace(WS_EDGE_RE, "");
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const f0 = (n: number) => n.toFixed(0);
const f1 = (n: number) => n.toFixed(1);

/**
 * The trailing phrase after the last 、，or ：, when it is at least TAIL_MIN
 * characters long. Used to find tails repeated across many titles.
 */
export function tailOf(title: string): string | null {
  const m = TAIL_RE.exec(title);
  return m ? m[1] : null;
}

/** Tails shared by more than MAX_SHARED_TAIL titles in the set, with their counts. */
export function boilerplateTails(titles: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const tail = tailOf(t);
    if (tail) counts.set(tail, (counts.get(tail) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [k, v] of counts) if (v > MAX_SHARED_TAIL) out.set(k, v);
  return out;
}

/**
 * Check one title. `boiler` is the result of boilerplateTails() over the whole
 * set the title belongs to; pass an empty map to check a title on its own.
 */
export function checkOne(title: string, boiler: ReadonlyMap<string, number> = new Map()): Verdict {
  const w = px(title);
  const fails: Finding[] = [];
  const warns: Finding[] = [];

  if (w > HARD) {
    fails.push({
      rule: "length_cut",
      message: `Cut: ${f0(w)}px (${f1(units(title))} full-width characters), ${f0(w - HARD)}px over the ${f0(HARD)}px line. Desktop results will truncate it.`,
    });
  } else if (w > EDGE) {
    fails.push({
      rule: "length_edge",
      message: `Too long: ${f0(w)}px (${f1(units(title))} full-width characters), inside the ${f0(EDGE)}-${f0(HARD)}px zone where desktop truncation starts.`,
    });
  } else if (w > SAFE) {
    warns.push({
      rule: "length_long",
      message: `Long: ${f0(w)}px (${f1(units(title))} full-width characters), over the ${f0(SAFE)}px safe line.`,
    });
  }

  const seps = SEPARATORS.reduce((n, s) => n + count(title, s), 0);
  if (seps > MAX_SEPARATORS) {
    fails.push({
      rule: "separators",
      message: `${seps} separators (、 or ，), limit ${MAX_SEPARATORS}. Each one is a place where Google can cut the title.`,
    });
  }

  const q = count(title, "？");
  if (q > MAX_QUESTION_MARKS) {
    fails.push({ rule: "question_marks", message: `${q} full-width question marks (？), limit ${MAX_QUESTION_MARKS}.` });
  }

  const tail = tailOf(title);
  if (tail && boiler.has(tail)) {
    fails.push({
      rule: "boilerplate_tail",
      message: `Boilerplate tail "${tail}" ends ${boiler.get(tail)} titles in this set. Google's title link guidance names boilerplate titles as a problem.`,
    });
  }

  // The keyword zone is everything before the first ？：、or ，.
  const m = KEYWORD_ZONE_END.exec(title);
  const head = m ? title.slice(0, m.index) : title;
  const hw = px(head);
  if (hw > FIRST_LINE) {
    warns.push({
      rule: "keyword_zone",
      message: `Keyword zone (text before the first ？：、，) is ${f0(hw)}px, wider than the ${f0(FIRST_LINE)}px first line on mobile, so the line breaks inside it.`,
    });
  }

  if (isBlank(title)) fails.push({ rule: "empty", message: "Empty title." });

  const runs = new Map<string, number>();
  for (const r of title.match(IDEOGRAPH_RUN) ?? []) runs.set(r, (runs.get(r) ?? 0) + 1);
  const dup = [...runs].filter(([, c]) => c >= STUFFING_REPEATS).map(([r]) => r);
  if (dup.length) {
    fails.push({
      rule: "stuffing",
      message: `Keyword stuffing: ${dup.join(", ")} appear ${STUFFING_REPEATS} or more times each.`,
    });
  }

  return { fails, warns };
}

export interface TitleInput {
  /** Where the title came from: a file path, or a label such as "(input 1)". */
  src: string;
  title: string;
}

export interface TitleResult {
  src: string;
  title: string;
  px: number;
  full_width_units: number;
  tier: Tier;
  fails: Finding[];
  warns: Finding[];
}

export interface Report {
  model: typeof MODEL;
  total: number;
  failed: number;
  boilerplate_tails: { tail: string; count: number }[];
  results: TitleResult[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Check a set of titles together, so boilerplate tails across the set are detected. */
export function measureTitles(items: readonly TitleInput[]): Report {
  const boiler = boilerplateTails(items.map((i) => i.title));
  let failed = 0;
  const results = items.map(({ src, title }) => {
    const w = px(title);
    const v = checkOne(title, boiler);
    if (v.fails.length) failed++;
    return {
      src, title,
      px: round1(w),
      full_width_units: round1(units(title)),
      tier: tier(w),
      fails: v.fails,
      warns: v.warns,
    };
  });
  return {
    model: MODEL,
    total: items.length,
    failed,
    boilerplate_tails: [...boiler].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([tail, count]) => ({ tail, count })),
    results,
  };
}
