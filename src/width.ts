/**
 * Pixel-width model for page titles in Google search results.
 *
 * Measured on 2026-09-18 on google.com with the zh-TW interface, Chrome on
 * Windows, by reading the computed style of the result heading and measuring
 * glyph advances with a canvas in the same page:
 *
 *   - Title font: Arial 22px, line-height 28px.
 *   - Desktop result column: 652px, the same at 1366px and 1920px viewports.
 *     Desktop truncation is done server-side ("..." appended), not by CSS.
 *   - Mobile: two lines clamped by CSS, 343px per line.
 *   - Full-width characters (East Asian Width W or F): 22.0px, i.e. 1em.
 *
 * Printable ASCII uses Arial's own advance widths (see ASCII_ADVANCE_UNITS).
 * Other half-width characters are estimated at 12.2px.
 *
 * If Google changes the title font size, every number in this file is wrong
 * and has to be measured again. See README.md, "Re-measuring".
 *
 * This file is pure: no I/O, no globals mutated.
 */

import { eastAsianWidthType } from "get-east-asian-width";

/** Title font size, and the width of one full-width character (1em). */
export const EM = 22.0;
/** Conservative safe line. Leaves room for narrow screens and for text Google adds or changes. */
export const SAFE = 572.0;
/** Edge zone starts here: close to the measured single-line limit on desktop. */
export const EDGE = 630.0;
/** Over this, the title is wider than the desktop column and will be truncated. */
export const HARD = 648.0;
/** Capacity of the first line of a result title on mobile (343px wide). */
export const FIRST_LINE = 343.0;
/** Estimated advance for a half-width character outside printable ASCII. */
export const DEFAULT_HALF = 12.2;

/**
 * Arial advance widths in font units (unitsPerEm 2048) for U+0020-U+007E, in
 * code point order. Arial Version 7.01 (Windows), measured with Pillow at
 * 2048px and checked against the font's hmtx table: scripts/measure-arial.py.
 * Unhinted, like browser text layout: W is 1933 units = 20.76px at 22px, which
 * matches a canvas measureText() in Chrome.
 */
const ARIAL_UNITS_PER_EM = 2048;
const ASCII_ADVANCE_UNITS: readonly number[] = [
  569, 569, 727, 1139, 1139, 1821, 1366, 391, 682, 682, 797, 1196, 569, 682, 569, 569,
  1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 1139, 569, 569, 1196, 1196, 1196, 1139,
  2079, 1366, 1366, 1479, 1479, 1366, 1251, 1593, 1479, 569, 1024, 1366, 1139, 1706, 1479, 1593,
  1366, 1593, 1479, 1366, 1251, 1479, 1366, 1933, 1366, 1366, 1251, 569, 569, 569, 961, 1139,
  682, 1139, 1139, 1024, 1139, 1139, 569, 1139, 1139, 455, 455, 1024, 455, 1706, 1139, 1139,
  1139, 1139, 682, 1024, 569, 1139, 1024, 1479, 1024, 1024, 1024, 684, 532, 684, 1196,
];

/** Width in px at 22px of every printable ASCII character. */
export const ASCII_PX: ReadonlyMap<string, number> = new Map(
  ASCII_ADVANCE_UNITS.map((u, i) => [String.fromCharCode(0x20 + i), (u * EM) / ARIAL_UNITS_PER_EM]),
);

/**
 * The 14 half-width advances of the unpublished reference implementation this
 * package was ported from. Its W (18.33) is wrong; Arial's W is 20.76. Kept
 * only so LEGACY_MODEL can reproduce the reference exactly in parity checks.
 */
export const LEGACY_HALF: ReadonlyMap<string, number> = new Map<string, number>([
  [" ", 6.11], ["i", 4.89], ["l", 4.89], ["j", 4.89], ["t", 6.11], ["f", 6.11], ["r", 7.33],
  ["I", 6.11], ["M", 18.33], ["W", 18.33], ["m", 18.33], ["w", 15.9], ["-", 7.33], [".", 6.11],
]);

/**
 * Code points that render with no width: zero width space, ZWNJ, ZWJ, word
 * joiner, BOM, variation selectors, and emoji skin-tone modifiers (which
 * merge into the preceding emoji).
 */
const ZERO_WIDTH_RANGES: readonly (readonly [number, number])[] = [
  [0x200b, 0x200d], [0x2060, 0x2060], [0xfe00, 0xfe0f], [0xfeff, 0xfeff],
  [0x1f3fb, 0x1f3ff], [0xe0100, 0xe01ef],
];

export function isZeroWidth(codePoint: number): boolean {
  return ZERO_WIDTH_RANGES.some(([a, b]) => codePoint >= a && codePoint <= b);
}

/** VARIATION SELECTOR-16: requests emoji presentation for the preceding character. */
const EMOJI_PRESENTATION = 0xfe0f;

/** Description of the measured model, returned to callers so they can see the assumptions. */
export const MODEL = {
  measured_on: "2026-09-18",
  serp: "google.com, zh-TW interface, Chrome on Windows",
  title_font: "Arial 22px",
  desktop_column_px: 652,
  mobile_line_px: FIRST_LINE,
  full_width_px: EM,
  ascii_widths: "Arial Version 7.01 advance widths, unhinted, for all 95 printable ASCII characters",
  other_half_width_px: DEFAULT_HALF,
  thresholds_px: { safe: SAFE, edge: EDGE, hard: HARD },
  full_width_rule: "East Asian Width W (wide) or F (fullwidth), per the get-east-asian-width package",
  clusters: "each grapheme cluster counts once, by its first visible code point; zero-width characters count 0; a cluster with U+FE0F counts as full width",
} as const;

/** Switches between this package's model and the reference it was ported from. */
export interface ModelOptions {
  /** Measured Arial widths for all printable ASCII; otherwise only the reference's 14 values. */
  asciiTable: boolean;
  /** Grapheme clusters count once and zero-width characters count 0; otherwise every code point counts. */
  graphemes: boolean;
}

export const DEFAULT_MODEL: ModelOptions = Object.freeze({ asciiTable: true, graphemes: true });
/** Reproduces the unpublished reference implementation. For parity checks only. */
export const LEGACY_MODEL: ModelOptions = Object.freeze({ asciiTable: false, graphemes: false });

/** True when the code point renders at full width (East Asian Width W or F). */
export function isFullWidth(codePoint: number): boolean {
  const type = eastAsianWidthType(codePoint);
  return type === "wide" || type === "fullwidth";
}

function charPx(ch: string, cp: number, o: ModelOptions): number {
  if (isFullWidth(cp)) return EM;
  if (o.asciiTable) return ASCII_PX.get(ch) ?? DEFAULT_HALF;
  return LEGACY_HALF.get(ch) ?? DEFAULT_HALF;
}

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Width of one grapheme cluster: its first visible code point decides. */
function clusterPx(cluster: string, o: ModelOptions): number {
  let first: string | null = null;
  let emoji = false;
  for (const ch of cluster) {
    const cp = ch.codePointAt(0) as number;
    if (cp === EMOJI_PRESENTATION) emoji = true;
    if (first === null && !isZeroWidth(cp)) first = ch;
  }
  if (first === null) return 0;
  return emoji ? EM : charPx(first, first.codePointAt(0) as number, o);
}

/**
 * Rendered width of a title in pixels.
 *
 * By default the string is split into grapheme clusters, so an emoji ZWJ
 * sequence, a flag, or a letter with combining accents counts once, and
 * zero-width characters count nothing. Iteration is by code point, never by
 * UTF-16 unit.
 */
export function px(s: string, o: ModelOptions = DEFAULT_MODEL): number {
  let total = 0.0;
  if (o.graphemes) {
    for (const { segment } of GRAPHEMES.segment(s)) total += clusterPx(segment, o);
  } else {
    for (const ch of s) total += charPx(ch, ch.codePointAt(0) as number, o);
  }
  return total;
}

/** Width expressed as a number of full-width characters, for humans. */
export function units(s: string, o: ModelOptions = DEFAULT_MODEL): number {
  return px(s, o) / EM;
}

export type Tier = "safe" | "long" | "edge" | "cut";

/**
 * safe: at or under 572px.
 * long: over 572px, at or under 630px (warning).
 * edge: over 630px, at or under 648px (must fix: inside the zone where desktop truncation starts).
 * cut:  over 648px (must fix: wider than the desktop column).
 */
export function tier(widthPx: number): Tier {
  if (widthPx > HARD) return "cut";
  if (widthPx > EDGE) return "edge";
  if (widthPx > SAFE) return "long";
  return "safe";
}
