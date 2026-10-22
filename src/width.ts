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
 *   - Half-width characters: measured advances below; anything not listed is
 *     estimated at 12.2px, the advance of a digit.
 *
 * If Google changes the title font size, every number in this file is wrong
 * and has to be measured again. See README.md, "Re-measuring".
 *
 * This file is pure: no I/O, no globals mutated.
 */

import { eastAsianWidthType } from "get-east-asian-width";

/** Width of one full-width character: 1em of Arial 22px. */
export const EM = 22.0;
/** Conservative safe line. Leaves room for narrow screens and for text Google adds or changes. */
export const SAFE = 572.0;
/** Edge zone starts here: close to the measured single-line limit on desktop. */
export const EDGE = 630.0;
/** Over this, the title is wider than the desktop column and will be truncated. */
export const HARD = 648.0;
/** Capacity of the first line of a result title on mobile (343px wide). */
export const FIRST_LINE = 343.0;
/** Estimated advance for a half-width character that is not in the measured table. */
export const DEFAULT_HALF = 12.2;

/** Measured Arial 22px advances for half-width characters that differ from the default. */
export const HALF: ReadonlyMap<string, number> = new Map<string, number>([
  [" ", 6.11], ["i", 4.89], ["l", 4.89], ["j", 4.89], ["t", 6.11], ["f", 6.11], ["r", 7.33],
  ["I", 6.11], ["M", 18.33], ["W", 18.33], ["m", 18.33], ["w", 15.9], ["-", 7.33], [".", 6.11],
]);

/** Description of the measured model, returned to callers so they can see the assumptions. */
export const MODEL = {
  measured_on: "2026-09-18",
  serp: "google.com, zh-TW interface, Chrome on Windows",
  title_font: "Arial 22px",
  desktop_column_px: 652,
  mobile_line_px: FIRST_LINE,
  full_width_px: EM,
  default_half_width_px: DEFAULT_HALF,
  thresholds_px: { safe: SAFE, edge: EDGE, hard: HARD },
  full_width_rule: "East Asian Width W (wide) or F (fullwidth), per the get-east-asian-width package",
} as const;

/** True when the code point renders at full width (East Asian Width W or F). */
export function isFullWidth(codePoint: number): boolean {
  const type = eastAsianWidthType(codePoint);
  return type === "wide" || type === "fullwidth";
}

/**
 * Rendered width of a title in pixels.
 *
 * Iterates by code point, not by UTF-16 unit: an emoji outside the BMP is one
 * full-width character, not two half-width ones.
 */
export function px(s: string): number {
  let total = 0.0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    total += isFullWidth(cp) ? EM : (HALF.get(ch) ?? DEFAULT_HALF);
  }
  return total;
}

/** Width expressed as a number of full-width characters, for humans. */
export function units(s: string): number {
  return px(s) / EM;
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
