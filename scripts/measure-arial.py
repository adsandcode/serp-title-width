# -*- coding: utf-8 -*-
"""Measure Arial advance widths for printable ASCII (U+0020-U+007E).

    python scripts/measure-arial.py [path/to/arial.ttf]

Prints the font version and a TypeScript array of advances in font units,
in code point order, for src/width.ts. Requires Pillow; fontTools is used for
a cross-check when installed.

Why measure at the font's units-per-em size instead of at 22px: at 22px
FreeType hints the glyphs and rounds each advance to a whole pixel (W comes
out as 21), while browsers lay out canvas and page text with unhinted,
fractional advances (W is 20.76 at 22px). At units-per-em size one pixel is
one font unit, so nothing is rounded. Width at 22px = units * 22 / unitsPerEm.
"""
import sys

from PIL import ImageFont

PATH = sys.argv[1] if len(sys.argv) > 1 else "C:/Windows/Fonts/arial.ttf"
UPEM = 2048  # Arial; checked against the head table below when fontTools is available

font = ImageFont.truetype(PATH, UPEM)
units = []
for cp in range(0x20, 0x7F):
    w = font.getlength(chr(cp))
    if w != int(w):
        sys.exit("advance for U+%04X is not a whole number of font units: %r" % (cp, w))
    units.append(int(w))

try:
    from fontTools.ttLib import TTFont
    tt = TTFont(PATH)
    if tt["head"].unitsPerEm != UPEM:
        sys.exit("unitsPerEm is %d, not %d" % (tt["head"].unitsPerEm, UPEM))
    cmap, hmtx = tt.getBestCmap(), tt["hmtx"]
    bad = [cp for cp, u in zip(range(0x20, 0x7F), units) if hmtx[cmap[cp]][0] != u]
    if bad:
        sys.exit("Pillow and the hmtx table disagree on: " + ", ".join("U+%04X" % c for c in bad))
    print("// %s, %s; Pillow and hmtx agree on all 95 advances" % (
        tt["name"].getDebugName(4), tt["name"].getDebugName(5)))
except ImportError:
    print("// fontTools not installed: hmtx cross-check skipped")

print("const ASCII_ADVANCE_UNITS: readonly number[] = [")
for i in range(0, len(units), 16):
    print("  " + ", ".join(str(u) for u in units[i:i + 16]) + ",")
print("];")
