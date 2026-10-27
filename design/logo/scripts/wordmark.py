"""Outlines the "armin" wordmark from Source Serif 4 into a font-free SVG path.

Usage (from the repo root, after pnpm install):
  uv run --with fonttools --with brotli --with uharfbuzz design/logo/scripts/wordmark.py \\
    node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2 \\
    design/logo/svg/armin-wordmark.svg [weight] [tracking]
Shapes with HarfBuzz so the font's own kerning applies; tracking is extra spacing in font units.
"""
import sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from io import BytesIO

src, out = sys.argv[1], sys.argv[2]
weight = float(sys.argv[3]) if len(sys.argv) > 3 else 600
tracking = float(sys.argv[4]) if len(sys.argv) > 4 else 0
text = "armin"

font = TTFont(src)
axes = {a.axisTag: a for a in font["fvar"].axes}
loc = {"wght": weight}
if "opsz" in axes:
    loc["opsz"] = axes["opsz"].maxValue  # display optical size: finer serifs suit a logo
font = instantiateVariableFont(font, loc)
buf = BytesIO(); font.flavor = None; font.save(buf)

face = hb.Face(buf.getvalue()); hbfont = hb.Font(face)
b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
hb.shape(hbfont, b, {"kern": True, "liga": False})

glyphs = font.getGlyphSet(); order = font.getGlyphOrder()
upm = font["head"].unitsPerEm
pen = SVGPathPen(glyphs)
x = 0
for i, (info, pos) in enumerate(zip(b.glyph_infos, b.glyph_positions)):
    name = order[info.codepoint]
    # font units are y-up; flip into SVG's y-down space with the baseline at y=0
    glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
    x += pos.x_advance + (tracking if i < len(b.glyph_infos) - 1 else 0)

# tight bounds from the drawn outlines
from fontTools.pens.boundsPen import BoundsPen
bp = BoundsPen(glyphs); x2 = 0
for i, (info, pos) in enumerate(zip(b.glyph_infos, b.glyph_positions)):
    glyphs[order[info.codepoint]].draw(TransformPen(bp, (1, 0, 0, -1, x2 + pos.x_offset, -pos.y_offset)))
    x2 += pos.x_advance + (tracking if i < len(b.glyph_infos) - 1 else 0)
xmin, ymin, xmax, ymax = bp.bounds
xh = font["OS/2"].sxHeight
import re
d = re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.1f}".rstrip("0").rstrip("."), pen.getCommands())
with open(out, "w") as fh:
    fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{xmin:.0f} {ymin:.0f} {xmax - xmin:.0f} {ymax - ymin:.0f}" '
             f'data-baseline="0" data-x-height="{xh}" data-upm="{upm}"><path d="{d}" fill="currentColor"/></svg>\n')
print(f"axes={list(axes)} loc={loc} bounds={bp.bounds} xHeight={xh} upm={upm}")
