#!/usr/bin/env python3
"""Build the Anki package used by the 2026-11-09 image occlusion walkthrough.

It holds every occlusion format the importer meets in real decks:

- Anki's built-in Image Occlusion (23.10+): a "hide all, guess one" note of
  rectangles, and a "hide one, guess one" note with an ellipse, a polygon, two
  shapes grouped under one cloze number, and a text label.
- Image Occlusion Enhanced (the pre-2023 add-on by Glutanimate): notes made
  the way the add-on's `ngen.py` makes them (ID field, mask SVGs written like
  svg-edit's `svgCanvasToString()` and then minidom's `toxml()`, file names
  `<uniq>-<tp>-<nr>-Q.svg`, `-A.svg`, and `<uniq>-<tp>-O.svg`, field HTML
  `<img src="…" />`). One "hide all" occlusion with a rect, an ellipse, a
  path, a rotated rect, a grouped mask, and a label, where one note has review
  history; one "hide one" occlusion where one note is suspended; and one
  occlusion whose mask files are missing from the package.
- AnKing's "IO-one by one" note, copied from All_AnKing_Note_Types.apkg, which
  Armin leaves out.

The diagrams are drawn with ImageMagick: every masked label sits on a plate
with a contrasting outline, so a mask that drifts from its plate is obvious.

Requires the `anki` Python package (ships with Anki desktop) and ImageMagick.
Run from the repository root with the AnKing sample path; the output goes to
the ignored `.armin/` folder:

  python3 -I docs/qa/2026-11-09-anki-image-occlusion/make-fixture.py \
      /tmp/anki-real/in/All_AnKing_Note_Types.apkg
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.dom import minidom

from anki.collection import (
    Collection,
    ExportAnkiPackageOptions,
    ImportAnkiPackageOptions,
    ImportAnkiPackageRequest,
)
from anki.notes import Note

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / ".armin" / "qa" / "anki-image-occlusion.apkg"
FONT = "Liberation-Sans"

# --- Diagrams ---------------------------------------------------------------

# Solar system, 1200×700 (landscape). Plates are the label areas masks cover.
SOLAR_W, SOLAR_H = 1200, 700
PLANETS = [
    # name, centre x, radius, colour
    ("Mercury", 120, 22, "#b7a99a"),
    ("Venus", 270, 34, "#e3c16f"),
    ("Earth", 430, 36, "#3f7fd6"),
    ("Mars", 580, 28, "#c8553d"),
    ("Jupiter", 780, 78, "#d7a46b"),
    ("Saturn", 1040, 64, "#e6cf8b"),
]
SOLAR_PLATE = (150, 54)  # plate width, height
SOLAR_PLATE_TOP = 520


def solar_plate(cx: int) -> tuple[int, int, int, int]:
    w, h = SOLAR_PLATE
    return (cx - w // 2, SOLAR_PLATE_TOP, w, h)


# Plant cell, 900×1200 (portrait, taller than the reviewer, so it letterboxes).
CELL_W, CELL_H = 900, 1200
CELL_PLATES = {
    "Nucleus": (330, 470, 240, 60),
    "Vacuole": (300, 760, 300, 60),
    "Cell wall": (40, 70, 230, 60),
    "Chloroplast": (560, 250, 260, 60),
    "Mitochondrion": (90, 1010, 300, 60),
    "Ribosome": (600, 1010, 220, 60),
}


def draw_solar(path: Path) -> None:
    args = ["magick", "-size", f"{SOLAR_W}x{SOLAR_H}", "xc:#0f1730", "-font", FONT]
    args += ["-fill", "#ffd34d", "-draw", f"circle -260,330 40,330"]  # the Sun's edge
    args += ["-fill", "#e8ecf8", "-pointsize", "34", "-annotate", "+330+70", "The inner and outer planets"]
    for name, cx, r, colour in PLANETS:
        x, y, w, h = solar_plate(cx)
        args += ["-fill", colour, "-draw", f"circle {cx},330 {cx + r},330"]
        args += ["-stroke", "#5b6b99", "-strokewidth", "2", "-fill", "none"]
        args += ["-draw", f"line {cx},{330 + r + 6} {cx},{y - 4}"]
        args += ["-stroke", "#ff4fa3", "-strokewidth", "3", "-fill", "#1d2850"]
        args += ["-draw", f"rectangle {x},{y} {x + w - 1},{y + h - 1}"]
        args += ["-stroke", "none", "-fill", "#ffffff", "-pointsize", "26", "-gravity", "NorthWest"]
        args += ["-annotate", f"+{x + 14}+{y + 13}", name]
    # A ring for Saturn and a grid tick every 100 px along the bottom edge.
    args += ["-stroke", "#c9b273", "-strokewidth", "5", "-fill", "none",
             "-draw", "ellipse 1040,330 110,22 0,360"]
    for x in range(0, SOLAR_W + 1, 100):
        args += ["-stroke", "#3a4774", "-strokewidth", "1", "-draw", f"line {x},{SOLAR_H - 30} {x},{SOLAR_H}"]
    subprocess.run([*args, str(path)], check=True)


def draw_cell(path: Path) -> None:
    args = ["magick", "-size", f"{CELL_W}x{CELL_H}", "xc:#fbf7ec", "-font", FONT]
    args += ["-stroke", "#3c7d3a", "-strokewidth", "18", "-fill", "#e3f1d2",
             "-draw", "roundrectangle 60,150 840,980 60,60"]
    args += ["-stroke", "none", "-fill", "#bcd9f2", "-draw", "ellipse 450,700 210,120 0,360"]
    args += ["-fill", "#b48ad8", "-draw", "circle 450,420 450,520"]
    args += ["-fill", "#6a3d9a", "-draw", "circle 450,420 450,450"]
    for cx, cy in ((690, 360), (230, 360), (700, 820), (230, 830)):
        args += ["-fill", "#4caf50", "-draw", f"ellipse {cx},{cy} 60,28 0,360"]
    args += ["-fill", "#f08a4b", "-draw", "ellipse 240,920 50,24 0,360"]
    for cx, cy in ((640, 900), (670, 930), (700, 905)):
        args += ["-fill", "#7a4a2a", "-draw", f"circle {cx},{cy} {cx + 7},{cy}"]
    for name, (x, y, w, h) in CELL_PLATES.items():
        args += ["-stroke", "#ff4fa3", "-strokewidth", "3", "-fill", "#ffffff"]
        args += ["-draw", f"rectangle {x},{y} {x + w - 1},{y + h - 1}"]
        args += ["-stroke", "none", "-fill", "#1c1b1a", "-pointsize", "32", "-gravity", "NorthWest"]
        args += ["-annotate", f"+{x + 16}+{y + 12}", name]
    args += ["-fill", "#1c1b1a", "-pointsize", "40", "-annotate", "+250+40", "A plant cell"]
    subprocess.run([*args, str(path)], check=True)


# --- Anki's built-in image occlusion -----------------------------------------


def f(value: float) -> str:
    """Anki writes fractions with four decimals and no leading zero."""
    text = f"{value:.4f}"
    return text[1:] if text.startswith("0") else text


def native_rect(n: int, x: float, y: float, w: float, h: float, oi: bool) -> str:
    props = (
        f"left={f(x / SOLAR_W)}:top={f(y / SOLAR_H)}:"
        f"width={f(w / SOLAR_W)}:height={f(h / SOLAR_H)}"
    )
    return f"{{{{c{n}::image-occlusion:rect:{props}{':oi=1' if oi else ''}}}}}<br>"


def native_occlusions_hide_all() -> str:
    return "".join(
        native_rect(n, *solar_plate(cx), oi=True) for n, (_, cx, _, _) in enumerate(PLANETS[:4], 1)
    )


def native_occlusions_mixed() -> str:
    jx, jy, jw, jh = solar_plate(780)
    sx, sy, sw, sh = solar_plate(1040)
    out = []
    # c1: an ellipse over Jupiter's plate (left/top = top-left of its box, rx/ry radii).
    out.append(
        f"{{{{c1::image-occlusion:ellipse:left={f(jx / SOLAR_W)}:top={f((jy - 6) / SOLAR_H)}:"
        f"rx={f(jw / 2 / SOLAR_W)}:ry={f((jh + 12) / 2 / SOLAR_H)}}}}}<br>"
    )
    # c2: a polygon (a pentagon) around Saturn's plate.
    pts = [(sx - 6, sy + sh // 2), (sx + sw // 2, sy - 10), (sx + sw + 6, sy + sh // 2),
           (sx + sw - 10, sy + sh + 8), (sx + 10, sy + sh + 8)]
    left = min(p[0] for p in pts) / SOLAR_W
    top = min(p[1] for p in pts) / SOLAR_H
    points = " ".join(f"{f(x / SOLAR_W)},{f(y / SOLAR_H)}" for x, y in pts)
    out.append(f"{{{{c2::image-occlusion:polygon:left={f(left)}:top={f(top)}:points={points}}}}}<br>")
    # c3: two rectangles grouped in Anki's editor share one cloze number.
    for cx in (120, 270):
        x, y, w, h = solar_plate(cx)
        out.append(
            f"{{{{c3::image-occlusion:rect:left={f(x / SOLAR_W)}:top={f(y / SOLAR_H)}:"
            f"width={f(w / SOLAR_W)}:height={f(h / SOLAR_H)}}}}}<br>"
        )
    # A text label, drawn on every card (Armin leaves it out with a warning).
    out.append("{{c0::image-occlusion:text:left=.3000:top=.9000:text=Not to scale:scale=1.0000:fs=.0400}}<br>")
    return "".join(out)


# --- Image Occlusion Enhanced (ported from ngen.py) ----------------------------

IOE_FIELDS = [
    "ID (hidden)", "Header", "Image", "Question Mask", "Footer", "Remarks", "Sources",
    "Extra 1", "Extra 2", "Answer Mask", "Original Mask",
]
QFILL = "#FF7E7E"
OFILL = "#FFEBA2"
SCOL = "#2D2D2D"


def ioe_notetype(col: Collection):
    """The add-on's model (template.py), with its real templates and CSS."""
    model = col.models.new("Image Occlusion Enhanced")
    for name in IOE_FIELDS:
        col.models.add_field(model, col.models.new_field(name))
    template = col.models.new_template("IO Card")
    template["qfmt"] = """{{#Image}}
<div id="io-header">{{Header}}</div>
<div id="io-wrapper">
  <div id="io-overlay">{{Question Mask}}</div>
  <div id="io-original">{{Image}}</div>
</div>
<div id="io-footer">{{Footer}}</div>
{{/Image}}
"""
    template["afmt"] = """{{#Image}}
<div id="io-header">{{Header}}</div>
<div id="io-wrapper">
  <div id="io-overlay">{{Answer Mask}}</div>
  <div id="io-original">{{Image}}</div>
</div>
{{#Footer}}<div id="io-footer">{{Footer}}</div>{{/Footer}}
<button id="io-revl-btn" onclick="toggle();">Toggle Masks</button>
<div id="io-extra-wrapper">
  <div id="io-extra">
    {{#Remarks}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Remarks</div>{{Remarks}}
      </div>
    {{/Remarks}}
    {{#Sources}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Sources</div>{{Sources}}
      </div>
    {{/Sources}}
    {{#Extra 1}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Extra 1</div>{{Extra 1}}
      </div>
    {{/Extra 1}}
    {{#Extra 2}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Extra 2</div>{{Extra 2}}
      </div>
    {{/Extra 2}}
  </div>
</div>
{{/Image}}
"""
    col.models.add_template(model, template)
    model["css"] = "#io-header{font-size:1.1em}#io-wrapper{position:relative;width:100%}"
    model["sortf"] = 1
    col.models.add(model)
    return col.models.by_name("Image Occlusion Enhanced")


def svg_edit_canvas(width: int, height: int, labels: list[str], masks: list[str]) -> str:
    """The string svg-edit's svgCanvasToString() hands to the add-on."""
    label_nodes = "".join(f"\n  {node}" for node in labels)
    mask_nodes = "".join(f"\n  {node}" for node in masks)
    return (
        f'<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg" '
        'xmlns:svg="http://www.w3.org/2000/svg">\n'
        " <!-- Created with Image Occlusion Enhanced -->\n"
        f" <g>\n  <title>Labels</title>{label_nodes}\n </g>\n"
        f" <g>\n  <title>Masks</title>{mask_nodes}\n </g>\n"
        "</svg>"
    )


class IoeGenerator:
    """ImgOccNoteGenerator.generateNotes without Qt: same IDs, masks, and files."""

    stripattr = ["opacity", "stroke-opacity", "fill-opacity"]

    def __init__(self, occl_tp: str, uniq_id: str, svg: str):
        self.occl_tp = occl_tp
        self.uniq_id = uniq_id
        self.occl_id = f"{uniq_id}-{occl_tp}"
        self.new_svg = svg
        self.qfill = QFILL

    def _layer_nodes(self, svg_node):
        return [n for n in svg_node.childNodes if n.nodeType == n.ELEMENT_NODE]

    def _remove_attribs(self, node, attrs):
        if node.nodeType == node.ELEMENT_NODE:
            for name in attrs:
                if node.hasAttribute(name):
                    node.removeAttribute(name)
            for child in node.childNodes:
                self._remove_attribs(child, attrs)

    def _mnodes_and_ids(self):
        self.mnode_indexes = []
        self.mnode_ids = {}
        doc = minidom.parseString(self.new_svg.encode("utf-8"))
        svg_node = doc.documentElement
        mlayer = self._layer_nodes(svg_node)[-1]
        for i, mnode in enumerate(mlayer.childNodes):
            if mnode.nodeType == mnode.ELEMENT_NODE and mnode.nodeName != "title":
                self.mnode_indexes.append(i)
                self._remove_attribs(mnode, self.stripattr)
                if mnode.nodeName == "g":
                    for child in mnode.childNodes:
                        self._remove_attribs(child, ["id"])
                self.mnode_ids[i] = f"{self.occl_id}-{len(self.mnode_indexes)}"
                mnode.setAttribute("id", self.mnode_ids[i])
        return svg_node

    def _set_question_attribs(self, node):
        if node.nodeType == node.ELEMENT_NODE and node.tagName != "text":
            node.setAttribute("class", "qshape")
            if node.hasAttribute("fill"):
                node.setAttribute("fill", self.qfill)
            for child in node.childNodes:
                self._set_question_attribs(child)

    def _create_mask(self, side: str, index: int) -> str:
        doc = minidom.parseString(self.new_svg.encode("utf-8"))
        svg_node = doc.documentElement
        mlayer = self._layer_nodes(svg_node)[-1]
        if self.occl_tp == "ao":  # IoGenHideAllRevealOne
            node = mlayer.childNodes[index]
            if side == "Q":
                self._set_question_attribs(node)
            else:
                mlayer.removeChild(node)
        else:  # IoGenHideOneRevealAll
            for i in reversed(self.mnode_indexes):
                node = mlayer.childNodes[i]
                if i == index and side == "Q":
                    self._set_question_attribs(node)
                    node.setAttribute("class", "qshape")
                else:
                    mlayer.removeChild(node)
        return svg_node.toxml()

    def generate(self):
        svg_node = self._mnodes_and_ids()
        self.new_svg = svg_node.toxml()
        files = {f"{self.occl_id}-O.svg": self.new_svg}
        notes = []
        for nr, idx in enumerate(self.mnode_indexes):
            note_id = self.mnode_ids[idx]
            q = self._create_mask("Q", idx)
            a = self._create_mask("A", idx)
            files[f"{note_id}-Q.svg"] = q
            files[f"{note_id}-A.svg"] = a
            notes.append(note_id)
        return notes, files


def img(name: str) -> str:
    return f'<img src="{name}" />'  # utils.path_to_img_element


def cell_rect(name: str, fill: str = OFILL) -> str:
    x, y, w, h = CELL_PLATES[name]
    return f'<rect id="svg_{name[:3].lower()}" height="{h}" width="{w}" y="{y}" x="{x}" stroke-width="3" stroke="{SCOL}" fill="{fill}"/>'


def ioe_hide_all_masks() -> list[str]:
    x, y, w, h = CELL_PLATES["Vacuole"]
    cx, cy, cw, ch = CELL_PLATES["Chloroplast"]
    mx, my, mw, mh = CELL_PLATES["Mitochondrion"]
    rx, ry, rw, rh = CELL_PLATES["Ribosome"]
    return [
        cell_rect("Nucleus"),
        # An ellipse drawn around the vacuole's plate.
        f'<ellipse id="svg_7" ry="{h // 2 + 8}" rx="{w // 2 + 10}" cy="{y + h // 2}" cx="{x + w // 2}" '
        f'stroke-width="3" stroke="{SCOL}" fill="{OFILL}"/>',
        # A hand-drawn path (pen tool) around the cell wall plate.
        '<path id="svg_8" d="m35,65l240,0l0,70l-240,0z" stroke-width="3" stroke="#2D2D2D" fill="#FFEBA2"/>',
        # The chloroplast's plate, slightly rotated with svg-edit's rotate handle.
        f'<rect id="svg_9" height="{ch}" width="{cw}" y="{cy}" x="{cx}" stroke-width="3" stroke="{SCOL}" '
        f'fill="{OFILL}" transform="rotate(4 {cx + cw / 2} {cy + ch / 2})"/>',
        # Two shapes grouped into one mask (Ctrl+G in the add-on's editor).
        f'<g id="svg_12"><rect id="svg_10" height="{mh}" width="{mw}" y="{my}" x="{mx}" stroke-width="3" '
        f'stroke="{SCOL}" fill="{OFILL}"/><rect id="svg_11" height="{rh}" width="{rw}" y="{ry}" x="{rx}" '
        f'stroke-width="3" stroke="{SCOL}" fill="{OFILL}"/></g>',
    ]


def ioe_label() -> str:
    return (
        '<text xml:space="preserve" text-anchor="start" font-family="Arial" font-size="24" '
        'id="svg_20" y="1150" x="560" stroke-width="0" stroke="#000000" fill="#000000">Drawn to scale?</text>'
    )


def add_ioe_notes(col, model, deck_id, uniq, tp, svg, image, fields, tags, media):
    notes_ids, files = IoeGenerator(tp, uniq, svg).generate()
    for name, text in files.items():
        # _saveMask writes straight into the media folder, keeping the name's
        # case (Anki's write_data would lowercase "-Q.svg").
        if name not in media.get("skip", set()):
            (Path(col.media.dir()) / name).write_bytes(text.encode("utf8"))
    notes = []
    for note_id in notes_ids:
        note = Note(col, model)
        note["ID (hidden)"] = note_id
        note["Image"] = img(image)
        note["Question Mask"] = img(f"{note_id}-Q.svg")
        note["Answer Mask"] = img(f"{note_id}-A.svg")
        note["Original Mask"] = img(f"{uniq}-{tp}-O.svg")
        for key, value in fields.items():
            note[key] = value
        note.tags = list(tags)
        col.add_note(note, deck_id)
        notes.append(note)
    return notes


# --- Package -------------------------------------------------------------------


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    anking = Path(sys.argv[1])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="anki-io-"))
    try:
        col = Collection(str(work / "collection.anki2"))
        draw_solar(work / "solar-system.png")
        draw_cell(work / "plant-cell.png")
        col.media.add_file(str(work / "plant-cell.png"))

        native_deck = col.decks.id("Occlusion::Anki image occlusion")
        ioe_deck = col.decks.id("Occlusion::Image Occlusion Enhanced")
        anking_deck = col.decks.id("Occlusion::AnKing")

        # Anki's own image occlusion notes.
        col.add_image_occlusion_notetype()
        io_model = next(m for m in col.models.all() if m["originalStockKind"] == 6)
        col.decks.select(native_deck)
        io_model["did"] = native_deck
        col.models.update_dict(io_model)
        image = str(work / "solar-system.png")
        col.add_image_occlusion_note(
            io_model["id"], image, native_occlusions_hide_all(),
            "Name the <b>inner</b> planets", "Rocky planets, closest to the Sun.", ["astronomy"],
        )
        col.add_image_occlusion_note(
            io_model["id"], image, native_occlusions_mixed(),
            "Name the planet", "Mercury and Venus have no moons.", ["astronomy", "giants"],
        )
        for nid in col.find_notes(f"mid:{io_model['id']}"):
            note = col.get_note(nid)
            if "Name the planet" in note["Header"]:
                note["Comments"] = "From astronomy lecture 3."
                col.update_note(note)

        # Image Occlusion Enhanced notes.
        ioe_model = ioe_notetype(col)
        hide_all = add_ioe_notes(
            col, ioe_model, ioe_deck, "6f1c0e2b9d7a4c58a3e2f1b0c9d8e7f6", "ao",
            svg_edit_canvas(CELL_W, CELL_H, [ioe_label()], ioe_hide_all_masks()),
            "plant-cell.png",
            {
                "Header": "Label the plant cell",
                "Footer": "Organelles of a typical plant cell.",
                "Remarks": "The vacuole can fill <b>90%</b> of the cell.",
                "Sources": "Campbell Biology, ch. 6",
            },
            ["biology", "cells"], {},
        )
        hide_one = add_ioe_notes(
            col, ioe_model, ioe_deck, "a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5", "oa",
            svg_edit_canvas(
                CELL_W, CELL_H, [],
                [cell_rect("Nucleus"), cell_rect("Vacuole"), cell_rect("Cell wall")],
            ),
            "plant-cell.png",
            {"Header": "Hide one: name this structure", "Extra 1": "Compare with an animal cell."},
            ["biology"], {},
        )
        missing = "0123456789abcdef0123456789abcdef"
        add_ioe_notes(
            col, ioe_model, ioe_deck, missing, "ao",
            svg_edit_canvas(CELL_W, CELL_H, [], [cell_rect("Nucleus"), cell_rect("Ribosome")]),
            "plant-cell.png",
            {"Header": "This occlusion's mask files are missing"},
            ["biology"],
            {"skip": {f"{missing}-ao-O.svg", f"{missing}-ao-1-Q.svg", f"{missing}-ao-2-Q.svg"}},
        )

        # Review history on the first hide-all mask; the second hide-one mask suspended.
        today = col.sched.today
        card = col.get_note(hide_all[0].id).cards()[0]
        col.db.execute(
            "update cards set type=2, queue=2, due=?, ivl=9, factor=2500, reps=3 where id=?",
            today + 4, card.id,
        )
        base = (col.crt + (today - 15) * 86400) * 1000
        for i, (ease, ivl, last, kind) in enumerate([(3, 1, 0, 0), (3, 3, 1, 1), (4, 9, 3, 1)]):
            col.db.execute(
                "insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) "
                "values (?, ?, -1, ?, ?, ?, 2500, 6000, ?)",
                base + i * 4 * 86_400_000, card.id, ease, ivl, last, kind,
            )
        suspended = col.get_note(hide_one[1].id).cards()[0]
        col.db.execute("update cards set queue=-1 where id=?", suspended.id)

        # AnKing's IO-one by one note, imported from the sample, everything else removed.
        col.import_anki_package(
            ImportAnkiPackageRequest(
                package_path=str(anking),
                options=ImportAnkiPackageOptions(with_scheduling=False, with_deck_configs=False),
            )
        )
        keep = col.models.by_name("IO-one by one")
        for model in col.models.all():
            if model["id"] in (keep["id"], io_model["id"], ioe_model["id"]):
                continue
            col.models.remove(model["id"])
        for nid in col.find_notes(f"mid:{keep['id']}"):
            col.set_deck(col.get_note(nid).card_ids(), anking_deck)
        for did in [d.id for d in col.decks.all_names_and_ids()]:
            if not col.decks.name(did).startswith("Occlusion"):
                if col.decks.card_count(did, include_subdecks=False) == 0 and did != 1:
                    col.decks.remove([did])

        options = ExportAnkiPackageOptions(
            with_scheduling=True, with_deck_configs=True, with_media=True, legacy=False
        )
        col.export_anki_package(out_path=str(OUT), options=options, limit=None)
        col.close()
        print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
