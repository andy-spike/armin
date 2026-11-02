#!/usr/bin/env python3
"""Build the Anki package used by the 2026-11-01 Anki compatibility walkthrough.

It exercises every import feature added in that change: audio (including an
audio-only listening card), superscript/subscript/highlight formatting, flags,
a buried card, Anki's new-card order, a deck options preset with FSRS
parameters, a custom note type, text-to-speech, an SVG image, and media Armin
still leaves out (WMA audio, MP4 video).

Requires the `anki` Python package (ships with Anki desktop) and ffmpeg. Run
from the repository root; the output goes to the ignored `.armin/` folder:

  python3 docs/qa/2026-11-01-anki-compatibility/make-fixture.py
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from anki.collection import Collection, ExportAnkiPackageOptions
from anki.notes import Note

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / ".armin" / "qa" / "anki-compatibility.apkg"

FSRS6 = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
    1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]

SVG = b"""<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
<rect width="240" height="120" fill="#fffcf0"/><circle cx="60" cy="60" r="40" fill="#24837b"/>
<text x="120" y="68" font-family="sans-serif" font-size="22" fill="#100f0f">SVG ok</text></svg>"""


def tone(path: Path, frequency: int, seconds: float = 0.8) -> None:
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
         f"sine=frequency={frequency}:duration={seconds}", str(path)],
        check=True,
    )


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="anki-compat-"))
    try:
        col = Collection(str(work / "collection.anki2"))

        # Media: two playable clips, one SVG, plus files Armin still leaves out.
        for name, frequency in (("hola.mp3", 440), ("gracias.ogg", 660)):
            tone(work / name, frequency)
            col.media.write_data(name, (work / name).read_bytes())
        col.media.write_data("diagram.svg", SVG)
        col.media.write_data("old.wma", b"0&\xb2u\x8ef\xcf\x11" + b"\0" * 64)
        col.media.write_data("clip.mp4", b"\0\0\0\x18ftypmp42" + b"\0" * 64)

        # Deck options preset with FSRS parameters and steps Armin can carry over.
        conf = col.decks.add_config_returning_id("Spanish preset")
        config = col.decks.get_config(conf)
        config["new"]["delays"] = [1.0, 10.0]
        config["new"]["perDay"] = 15
        config["lapse"]["delays"] = [10.0]
        config["rev"]["perDay"] = 150
        config["rev"]["maxIvl"] = 3650
        config["desiredRetention"] = 0.87
        config["fsrsParams6"] = FSRS6
        col.decks.update_config(config)

        spanish = col.decks.id("Compat::Spanish")
        science = col.decks.id("Compat::Science")
        deck = col.decks.get(spanish)
        deck["conf"] = conf
        col.decks.save(deck)

        basic = col.models.by_name("Basic")

        def add(deck_id: int, front: str, back: str, tags: list[str] | None = None) -> Note:
            note = Note(col, basic)
            note["Front"] = front
            note["Back"] = back
            note.tags = tags or []
            col.add_note(note, deck_id)
            return note

        # Spanish: audio, a listening card, and new cards in a deliberate order.
        listening = add(spanish, "[sound:hola.mp3]", "hola — hello", ["listening"])
        add(spanish, "How do you say <b>thank you</b>? [sound:gracias.ogg]", "gracias")
        ordered = [add(spanish, f"Order {n}: word {n}", f"meaning {n}") for n in range(1, 6)]
        add(spanish, "Legacy audio [sound:old.wma] and video [sound:clip.mp4]", "Still has text")

        # Science: formatting Armin now keeps, plus an SVG image.
        water = add(
            science,
            "What is H<sub>2</sub>O, and what is x<sup>2</sup> when x = 3?",
            'Water; <span style="color: rgb(255, 0, 0);">nine</span>. '
            '<u>Underlined</u>, <span style="color: rgb(0, 0, 0);">black text</span>, '
            "<mark>highlighted</mark>.",
        )
        add(science, "Name this diagram", '<img src="diagram.svg">')

        # A custom note type the preview can map, with text-to-speech on its back.
        vocab = col.models.new("Vocab (custom)")
        for field in ("Word", "Meaning", "Example", "Audio"):
            col.models.add_field(vocab, col.models.new_field(field))
        template = col.models.new_template("Recognize")
        template["qfmt"] = "<div class=word>{{Word}}</div>{{Audio}}"
        template["afmt"] = (
            "{{FrontSide}}<hr id=answer>{{Meaning}}<br><i>{{Example}}</i><br>{{tts es_ES:Word}}"
        )
        col.models.add_template(vocab, template)
        col.models.add(vocab)
        vocab = col.models.by_name("Vocab (custom)")
        for word, meaning, example, audio in (
            ("perro", "dog", "El perro duerme.", "[sound:hola.mp3]"),
            ("gato", "cat", "El gato come.", ""),
        ):
            note = Note(col, vocab)
            note["Word"], note["Meaning"], note["Example"], note["Audio"] = word, meaning, example, audio
            col.add_note(note, spanish)

        # Scheduling: review state, a flag, a buried card, and the new-card order.
        def cards_of(note: Note) -> list[int]:
            return [int(row[0]) for row in col.db.execute("select id from cards where nid=?", note.id)]

        today = col.sched.today
        for card_id in cards_of(listening):
            col.db.execute(
                "update cards set type=2, queue=2, due=?, ivl=12, factor=2500, reps=4, flags=1 where id=?",
                today + 3, card_id,
            )
        for card_id in cards_of(water):
            col.db.execute(
                "update cards set type=2, queue=-3, due=?, ivl=30, factor=2600, reps=6, flags=4 where id=?",
                today + 1, card_id,
            )
        # Anki learns new cards by `due` position; reverse the creation order to prove it is kept.
        for position, note in enumerate(reversed(ordered), start=1):
            for card_id in cards_of(note):
                col.db.execute("update cards set due=? where id=?", position, card_id)

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
