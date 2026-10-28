#!/usr/bin/env python3
"""Generate synthetic Anki fixtures for the Convex Node-action benchmark.

The fixtures are synthetic, deterministic, and written outside Git (the
default directory is `.armin/anki-bench/fixtures/`, which `.gitignore` covers).
They exist to exercise parser memory and time at controlled sizes; they are not
real-world collections and their card counts are not representative of any
particular deck.

Requires the `anki` Python package that ships with the desktop app. Run from
the repository root:

  python3 docs/research/anki-import-bench/make-fixture.py \
    --out .armin/anki-bench/fixtures/large-modern.apkg \
    --format modern --notes 30000 --reviews 100000 --field-chars 400

  python3 docs/research/anki-import-bench/make-fixture.py \
    --out .armin/anki-bench/fixtures/high-compression.apkg \
    --format modern --notes 20000 --reviews 0 --field-chars 8000 --repeat

  python3 docs/research/anki-import-bench/make-fixture.py \
    --out .armin/anki-bench/fixtures/media-heavy.apkg \
    --format modern --notes 2000 --reviews 0 --images 2000 --image-bytes 30000

  python3 docs/research/anki-import-bench/make-fixture.py \
    --out .armin/anki-bench/fixtures/large-text.txt --kind text --notes 50000
"""

from __future__ import annotations

import argparse
import random
import shutil
import struct
import tempfile
import zlib
from pathlib import Path

from anki.collection import AddNoteRequest, Collection, ExportAnkiPackageOptions
from anki.notes import Note

REPO = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO / ".armin" / "anki-bench" / "fixtures"


def png_bytes(width: int, height: int, seed: int) -> bytes:
    """A deterministic, poorly-compressing RGB PNG (no external imaging deps)."""
    rng = random.Random(seed)
    rows = bytearray()
    for _y in range(height):
        rows.append(0)  # filter: none
        for _x in range(width):
            rows.extend((rng.randrange(256), rng.randrange(256), rng.randrange(256)))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 1))
        + chunk(b"IEND", b"")
    )


def build_apkg(args) -> None:
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="anki-bench-"))
    try:
        col = Collection(str(work / "collection.anki2"))
        notetype = col.models.by_name("Basic")
        if notetype is None:
            raise SystemExit("Basic notetype missing from the Anki collection")
        deck_id = int(col.decks.current()["id"])

        media_names: list[str] = []
        if args.images:
            width = max(4, int(round((args.image_bytes / 3) ** 0.5)))
            for i in range(args.images):
                name = f"bench-{i:05d}.png"
                col.media.write_data(name, png_bytes(width, width, 1000 + i))
                media_names.append(name)

        filler = ("The quick brown fox jumps over the lazy dog. " * ((args.field_chars // 45) + 1))[
            : args.field_chars
        ]
        tags = ["bench", "synthetic"]
        notes = []
        for i in range(args.notes):
            note = Note(col, notetype)
            back = f"Answer {i}"
            if filler:
                back += " " + (filler if args.repeat else f"{filler} {i} ")
            if media_names:
                back += f' <img src="{media_names[i % len(media_names)]}">'
            note["Front"] = f"Question {i} [synthetic]"
            note["Back"] = back
            note.tags = tags
            notes.append(AddNoteRequest(note, deck_id))

        batch = args.batch
        for start in range(0, len(notes), batch):
            col.add_notes(notes[start : start + batch])
            done = min(start + batch, len(notes))
            if done % (batch * 10) == 0 or done == len(notes):
                print(f"added {done}/{len(notes)} notes", flush=True)

        if args.reviews:
            card_ids = [int(row[0]) for row in col.db.execute("select id from cards order by id")]
            # Deterministic review history ending at a fixed "now" near the
            # collection creation time. Values only need to be readable by the
            # importer; this is not a schedule-correctness fixture.
            now_ms = 1_761_696_000_000
            per_card = max(1, args.reviews // max(1, len(card_ids)))
            rows = []
            review_id = now_ms - args.reviews * 1000
            for index, card_id in enumerate(card_ids):
                col.db.execute(
                    "update cards set type=2, queue=2, due=?, ivl=?, factor=2500, reps=?, lapses=0 where id=?",
                    args.reviews // 2 + index,
                    10 + (index % 30),
                    per_card,
                    card_id,
                )
                for n in range(per_card):
                    review_id += 1000
                    rows.append((review_id, card_id, 0, 3, 10, 5, 2500, 0, 1))
            col.db.executemany(
                "insert into revlog (id,cid,usn,ease,ivl,lastIvl,factor,time,type) values (?,?,?,?,?,?,?,?,?)",
                rows,
            )
            print(f"added {len(rows)} review log rows", flush=True)

        options = ExportAnkiPackageOptions(
            with_scheduling=True,
            with_deck_configs=True,
            with_media=bool(args.images),
            legacy=args.format == "legacy",
        )
        col.export_anki_package(out_path=str(out), options=options, limit=None)
        col.close()
        print(f"wrote {out} ({out.stat().st_size} bytes)", flush=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def build_text(args) -> None:
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    filler = ("lorem ipsum dolor sit amet " * ((args.field_chars // 27) + 1))[: args.field_chars]
    with out.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("#separator:tab\n#html:true\n#tags column:3\n")
        for i in range(args.notes):
            front = f"Question {i} [synthetic]"
            back = f"Answer {i} {filler}".strip()
            handle.write(f"{front}\t{back}\tbench synthetic\n")
    print(f"wrote {out} ({out.stat().st_size} bytes)", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--kind", choices=["apkg", "text"], default="apkg")
    parser.add_argument("--format", choices=["modern", "legacy"], default="modern")
    parser.add_argument("--notes", type=int, default=1000)
    parser.add_argument("--reviews", type=int, default=0)
    parser.add_argument("--field-chars", type=int, default=200)
    parser.add_argument("--repeat", action="store_true", help="repeat identical field text (high compression)")
    parser.add_argument("--images", type=int, default=0)
    parser.add_argument("--image-bytes", type=int, default=30000)
    parser.add_argument("--batch", type=int, default=500)
    args = parser.parse_args()
    if args.out is None:
        args.out = DEFAULT_OUT / ("synthetic.apkg" if args.kind == "apkg" else "synthetic.txt")
    if args.kind == "text":
        build_text(args)
    else:
        build_apkg(args)


if __name__ == "__main__":
    main()
