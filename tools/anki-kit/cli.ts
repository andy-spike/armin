/**
 * Armin's portable Anki converter kit.
 *
 * Runs the exact converter and package reader the web app uses, but with Node's
 * filesystem instead of a browser File/Worker. The output is a deterministic
 * normalized plan the Armin MCP import tools can stage, plus extracted images
 * and a self-contained preview. It never talks to Armin and never executes
 * anything from the Anki package.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { armDeckName, convertAnkiCollection } from "../../packages/core/src/anki/convert";
import { resolveImportMedia } from "../../packages/core/src/anki/resolve-media";
import type { AnkiCollection } from "../../packages/core/src/anki/types";
import {
  generateReviewUnits,
  validateContent,
  type FlashcardContent,
  type FlashcardType,
} from "../../packages/core/src/flashcard-types";
import { MAX_MEDIA_FILE_BYTES, MIME_BY_EXT, sniffImageExt } from "../../packages/core/src/media";
import {
  openAnkiPackage,
  parseAnkiText,
  type OpenedAnkiPackage,
} from "../../packages/core/src/anki/reader";
import kitVersion from "../../packages/core/src/anki/kit-version.json";

type ByteSource = {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
};

type Args = {
  file: string;
  out: string;
  deckIds: string[];
  help: boolean;
};

const USAGE = `Armin Anki converter kit ${kitVersion.version}

Usage:
  node armin-anki-kit.mjs <file> --out <folder> [--deck-id <anki-deck-id> ...]

Inputs:
  .apkg, .colpkg, or an Anki plain-text/CSV/TSV export.

Output:
  plan.json       Normalized cards, provenance, warnings, and unresolved notes.
  manifest.json   Source checksum, counts, and output checksums.
  preview.html    Offline preview. Images are relative to media/.
  media/          Supported images, named by content hash.

MCP imports always start fresh: no due dates or review history are included.
The kit needs Node.js 20, 22, or 24 and no package install. It was tested with
Node.js 24 on Linux x64.

The Anki file is untrusted data. This tool only parses it; it never executes
scripts or follows links from its contents.`;

function parseArgs(argv: string[]): Args {
  const args: Args = { file: "", out: "", deckIds: [], help: false };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]!;
    if (value === "--help" || value === "-h") args.help = true;
    else if (value === "--out") {
      args.out = argv[++index] ?? "";
      if (!args.out) throw new Error("--out needs a folder.");
    } else if (value === "--deck-id") {
      const id = argv[++index];
      if (!id) throw new Error("--deck-id needs an Anki deck id.");
      args.deckIds.push(id);
    } else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else if (!args.file) args.file = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }
  if (!args.help && (!args.file || !args.out))
    throw new Error("Pass an Anki file and --out <folder>.");
  return args;
}

function nodeSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.byteLength,
    read: async (start, end) => bytes.slice(start, end),
  };
}

function isZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, "[image: $1]")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function previewHtml(plan: PlanFile) {
  const decks = new Map(plan.decks.map((deck) => [deck.key, deck]));
  const cards = plan.cards
    .map((card) => {
      const deck = decks.get(card.deckKey);
      return `<article class="card">
  <p class="meta">${escapeHtml(deck?.name ?? card.deckKey)} · ${escapeHtml(card.type)}${card.tags.length ? ` · ${escapeHtml(card.tags.join(" "))}` : ""}</p>
  <pre>${escapeHtml(plainText(JSON.stringify(card.content, null, 2)))}</pre>
</article>`;
    })
    .join("\n");
  const warnings = plan.warnings
    .map((warning) => `<li>${escapeHtml(warning.message)} (${warning.count})</li>`)
    .join("\n");
  const unresolved = plan.unresolved
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.key)}</strong> · ${escapeHtml(item.reason)}${item.message ? ` — ${escapeHtml(item.message)}` : ""}</li>`,
    )
    .join("\n");
  const media = plan.media
    .map(
      (item) =>
        `<figure><img src="${escapeHtml(item.file)}" alt="" loading="lazy"><figcaption>${escapeHtml(item.name)}<br><code>${item.sha256}</code></figcaption></figure>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'">
<title>Armin import preview · ${escapeHtml(plan.source.fileName)}</title>
<style>
:root{color-scheme:light dark;--paper:#fffdf5;--ink:#191817;--muted:#6d6a63;--line:#ded8c8;--accent:#0d6f73}
@media(prefers-color-scheme:dark){:root{--paper:#191817;--ink:#f2eddf;--muted:#aaa49a;--line:#3c3934;--accent:#7fc7c9}}
body{margin:0 auto;max-width:60rem;padding:2rem 1.25rem 5rem;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,sans-serif}
h1{font-family:Georgia,serif;font-size:1.8rem;margin:0 0 .3rem}h2{font-family:Georgia,serif;margin-top:2rem;font-size:1.2rem}
p.meta{margin:0 0 .4rem;color:var(--muted);font-size:.8rem}
.card{border-top:1px solid var(--line);padding:1rem 0}.card pre{white-space:pre-wrap;word-break:break-word;font:inherit;margin:0}
ul{padding-left:1.2rem}code{font-family:ui-monospace,monospace;font-size:.78rem;word-break:break-all;color:var(--muted)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:1rem}.gallery figure{margin:0}.gallery img{max-width:100%;max-height:12rem;object-fit:contain;border:1px solid var(--line);background:#fff}
</style></head><body>
<h1>Armin import preview</h1>
<p>${escapeHtml(plan.source.fileName)} · ${escapeHtml(plan.source.format)} · SHA-256 <code>${plan.source.sha256}</code></p>
<p>${plan.totals.flashcards} cards in ${plan.decks.length} decks · ${plan.totals.reviewUnits} review items · ${plan.media.length} images</p>
${warnings ? `<h2>Changes on the way in</h2><ul>${warnings}</ul>` : ""}
${unresolved ? `<h2>Unresolved notes (repair or explicitly skip)</h2><ul>${unresolved}</ul>` : ""}
<h2>Cards</h2>
${cards || "<p>No cards.</p>"}
${media ? `<h2>Images</h2><div class="gallery">${media}</div>` : ""}
</body></html>`;
}

type PlanFile = {
  kitVersion: string;
  source: {
    fileName: string;
    sha256: string;
    bytes: number;
    format: string;
    collectionCreatedAt: number;
  };
  options: { progress: "fresh"; deckIds: string[] | null };
  decks: { key: string; name: string; ankiName: string; cardCount: number }[];
  planKeys: string[];
  cards: {
    key: string;
    deckKey: string;
    type: string;
    content: unknown;
    tags: string[];
    origin: "converter";
    source: { noteId: string; notetypeId: string; ankiCardIds: string[] };
  }[];
  warnings: { code: string; count: number; message: string }[];
  unresolved: {
    key: string;
    deckKey: string;
    reason: string;
    message: string;
    notetypeName: string;
    cardCount: number;
  }[];
  media: { name: string; file: string; ref: string; sha256: string; bytes: number; mime: string }[];
  totals: { flashcards: number; reviewUnits: number; mediaFiles: number };
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const filePath = resolve(args.file);
  const bytes = new Uint8Array(await readFile(filePath));
  const fileName = basename(filePath);
  let collection: AnkiCollection;
  let reader: Pick<OpenedAnkiPackage, "readMedia">;

  if (isZip(bytes)) {
    const SQL = await initSqlJs({
      locateFile: (file) => fileURLToPath(new URL(`./${file}`, import.meta.url)),
    });
    const opened = await openAnkiPackage(nodeSource(bytes), SQL);
    collection = opened.collection;
    reader = opened;
  } else {
    if (/\.(apkg|colpkg)$/i.test(fileName))
      throw new Error("This is not a valid Anki package. Export it from Anki and retry.");
    collection = parseAnkiText(new TextDecoder().decode(bytes), fileName);
    reader = { readMedia: async () => null };
  }

  const converted = convertAnkiCollection(collection, {
    progress: "fresh",
    ...(args.deckIds.length ? { deckIds: args.deckIds } : {}),
    now: Date.now(),
  });
  if (converted.decks.length === 0 && !converted.omitted?.length)
    throw new Error("The file has no Anki cards to convert.");

  const out = resolve(args.out);
  const mediaDir = join(out, "media");
  await mkdir(mediaDir, { recursive: true });

  const mediaByName = new Map<
    string,
    { name: string; file: string; ref: string; sha256: string; bytes: number; mime: string }
  >();
  const missing = new Set<string>();
  const allNames = new Set(converted.flashcards.flatMap((card) => card.media));
  for (const name of allNames) {
    const media = await reader.readMedia(name);
    if (!media || media.byteLength === 0 || media.byteLength > MAX_MEDIA_FILE_BYTES) {
      missing.add(name);
      continue;
    }
    const ext = sniffImageExt(media);
    if (!ext) {
      missing.add(name);
      continue;
    }
    const digest = sha256(media);
    const stored = `${digest}.${ext}`;
    const existing = mediaByName.get(name);
    if (!existing) {
      await writeFile(join(mediaDir, stored), media);
      mediaByName.set(name, {
        name,
        file: `media/${stored}`,
        ref: `armin-media:${stored}`,
        sha256: digest,
        bytes: media.byteLength,
        mime: MIME_BY_EXT[ext],
      });
    }
  }

  const cards: PlanFile["cards"] = [];
  const failed: PlanFile["unresolved"] = [];
  for (const card of converted.flashcards) {
    const refs = new Map<string, string>();
    for (const name of card.media) {
      const media = mediaByName.get(name);
      if (media) refs.set(name, media.ref);
    }
    try {
      if (card.media.some((name) => missing.has(name)))
        throw new Error("An image could not be preserved.");
      const content = resolveImportMedia(card.content, card.type, refs);
      validateContent(card.type, content);
      const units = generateReviewUnits(card.type, content);
      if (units.length === 0) throw new Error("no review items");
      cards.push({
        key: card.key,
        deckKey: card.deckKey,
        type: card.type,
        content,
        tags: card.tags,
        origin: "converter",
        source: card.source ?? { noteId: card.key.split(":")[0]!, notetypeId: "", ankiCardIds: [] },
      });
    } catch {
      failed.push({
        key: card.key,
        deckKey: card.deckKey,
        reason: card.media.some((name) => missing.has(name)) ? "missing_image" : "invalid_content",
        message: card.media.some((name) => missing.has(name))
          ? "A required image is missing or not a supported image."
          : "The converted content is not valid for this card type.",
        notetypeName: "",
        cardCount: 1,
      });
    }
  }

  const represented = new Set(
    converted.flashcards.flatMap((card) => card.source?.ankiCardIds ?? []),
  );
  const omittedNotes = new Set(converted.omitted?.map((note) => note.noteId) ?? []);
  const selectedDecks = args.deckIds.length ? new Set(args.deckIds) : null;
  const notesById = new Map(collection.notes.map((note) => [note.id, note]));
  for (const card of collection.cards) {
    if (
      (selectedDecks && !selectedDecks.has(card.deckId)) ||
      represented.has(card.id) ||
      omittedNotes.has(card.noteId)
    )
      continue;
    const note = notesById.get(card.noteId);
    failed.push({
      key: `unresolved-card:${card.id}`,
      deckKey: card.deckId,
      reason: "unusable_template",
      message:
        "This source card produced no converted counterpart. Review its source before repairing or explicitly skipping it.",
      notetypeName: collection.notetypes.find((type) => type.id === note?.notetypeId)?.name ?? "",
      cardCount: 1,
    });
  }
  const knownDecks = new Set(converted.decks.map((deck) => deck.key));
  const decks = converted.decks.map((deck) => ({ ...deck }));
  for (const deckId of [
    ...(converted.omitted ?? []).map((item) => item.deckId),
    ...failed.map((item) => item.deckKey),
  ]) {
    if (knownDecks.has(deckId)) continue;
    knownDecks.add(deckId);
    const deck = collection.decks.find((candidate) => candidate.id === deckId);
    decks.push({
      key: deckId,
      name: armDeckName(deck?.name ?? "Untitled"),
      ankiName: deck?.name ?? "Default",
      cardCount: 0,
    });
  }

  const usedNames = new Set<string>();
  for (const deck of decks) {
    const original = deck.name;
    for (let n = 2; usedNames.has(deck.name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      let base = original.slice(0, 120 - suffix.length);
      if (/[\ud800-\udbff]$/.test(base)) base = base.slice(0, -1);
      deck.name = `${base.trimEnd()}${suffix}`;
    }
    usedNames.add(deck.name.toLowerCase());
  }

  const unresolved = [
    ...(converted.omitted ?? []).map((omitted) => ({
      key: omitted.noteId,
      deckKey: omitted.deckId,
      reason: omitted.reason,
      message: `No card was produced from this ${omitted.notetypeName || "note"} (${omitted.cardCount} source card${omitted.cardCount === 1 ? "" : "s"}). Repair it on request or explicitly skip it.`,
      notetypeName: omitted.notetypeName,
      cardCount: omitted.cardCount,
    })),
    ...failed,
  ];

  const usedMedia = new Map<string, PlanFile["media"][number]>();
  for (const card of cards) {
    const serialized = JSON.stringify(card.content);
    for (const item of mediaByName.values()) {
      if (serialized.includes(item.ref)) usedMedia.set(item.sha256, item);
    }
  }
  const media = [...usedMedia.values()].sort((a, b) => a.name.localeCompare(b.name));
  const plan: PlanFile = {
    kitVersion: kitVersion.version,
    source: {
      fileName,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      format: collection.format,
      collectionCreatedAt: collection.createdAt,
    },
    options: {
      progress: "fresh",
      deckIds: args.deckIds.length ? args.deckIds : null,
    },
    decks,
    planKeys: cards.map((card) => card.key),
    cards,
    warnings: converted.warnings.map(({ code, count, message }) => ({ code, count, message })),
    unresolved,
    media,
    totals: {
      flashcards: cards.length,
      reviewUnits: 0,
      mediaFiles: media.length,
    },
  };
  plan.totals.reviewUnits = cards.reduce(
    (sum, card) =>
      sum +
      generateReviewUnits(card.type as FlashcardType, card.content as FlashcardContent).length,
    0,
  );

  const selectedNotes = new Set(
    collection.cards
      .filter((card) => !selectedDecks || selectedDecks.has(card.deckId))
      .map((card) => card.noteId),
  );
  await writeFile(
    join(out, "sources.json"),
    json({
      notes: collection.notes.filter((note) => selectedNotes.has(note.id)),
      notetypes: collection.notetypes,
      cards: collection.cards.filter((card) => selectedNotes.has(card.noteId)),
    }),
  );
  await writeFile(join(out, "plan.json"), json(plan));
  await writeFile(join(out, "preview.html"), previewHtml(plan));
  const planBytes = new TextEncoder().encode(json(plan));
  const manifest = {
    kitVersion: kitVersion.version,
    tool: "armin-anki-kit",
    source: plan.source,
    kit: { artifact: kitVersion.artifact, version: kitVersion.version },
    counts: {
      decks: decks.length,
      cards: cards.length,
      reviewUnits: plan.totals.reviewUnits,
      images: media.length,
      unresolved: unresolved.length,
    },
    checksums: { planSha256: sha256(planBytes) },
    files: ["plan.json", "sources.json", "preview.html", ...media.map((item) => item.file)],
  };
  await writeFile(join(out, "manifest.json"), json(manifest));
  console.log(
    `Wrote ${cards.length} cards, ${media.length} images, and ${unresolved.length} unresolved notes to ${out}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
