/**
 * Reads `.apkg` / `.colpkg` Anki packages into an {@link AnkiCollection}.
 *
 * Three layouts exist, tried newest first:
 * - `collection.anki21b`: zstd-compressed SQLite, schema 18 (Anki ≥ 2.1.50),
 *   with a zstd protobuf `media` list and zstd-compressed media members.
 * - `collection.anki21`: SQLite schema 11 with notetypes and decks as JSON.
 * - `collection.anki2`: the same, from older Anki versions. Newer exports also
 *   include a placeholder `collection.anki2` telling the user to update Anki;
 *   it is only read when nothing newer is present.
 *
 * This module has no browser-only imports so Node can drive it directly; the
 * worker supplies the SQLite engine and the `Blob` source.
 */

import type {
  AnkiCard,
  AnkiCollection,
  AnkiDeck,
  AnkiNote,
  AnkiNotetype,
  AnkiPackageFormat,
  AnkiReview,
  AnkiTemplate,
} from "@armin/core/anki";
import type { Database, SqlJsStatic } from "sql.js";
import { decompress as zstdDecompress } from "fzstd";
import { AnkiImportError } from "./errors";
import { protoString, readProtoFields } from "./protobuf";
import { readZipDirectory, readZipEntry, type ByteSource, type ZipEntry } from "./zip";

/** Highest `col.ver` schema this reader understands (Anki 2.1.50+ through 25.x). */
const MAX_SCHEMA_VERSION = 18;
/** Highest `meta` PackageMetadata.Version (VERSION_LATEST). */
const MAX_PACKAGE_VERSION = 3;
const NAME_SEPARATOR = "\x1f";

export type OpenedAnkiPackage = {
  collection: AnkiCollection;
  /** Decompressed bytes for one media file, or null when the package lacks it. */
  readMedia(name: string): Promise<Uint8Array | null>;
};

export async function openAnkiPackage(
  source: ByteSource,
  SQL: SqlJsStatic,
): Promise<OpenedAnkiPackage> {
  const entries = await readZipDirectory(source);
  if (![...entries.keys()].some((name) => name.startsWith("collection.anki2"))) {
    throw new AnkiImportError(
      "This ZIP file isn't an Anki package: it has no collection. Choose an .apkg or .colpkg exported from Anki.",
    );
  }

  const meta = entries.get("meta");
  if (meta) {
    const version = packageVersion(await readZipEntry(source, meta));
    if (version > MAX_PACKAGE_VERSION) {
      throw new AnkiImportError(
        "This package was exported by a newer version of Anki than Armin supports. Export it again using “Support older Anki versions”.",
      );
    }
  }

  const { name: collectionName, format } = pickCollection(entries);
  let collectionBytes = await readZipEntry(source, entries.get(collectionName)!);
  if (format === "anki21b") collectionBytes = decompressZstd(collectionBytes);

  const collection = readCollection(SQL, collectionBytes, format);
  if (collection.cards.length === 0) {
    throw new AnkiImportError("This Anki collection has no cards to import.");
  }

  const compressedMedia = format === "anki21b";
  const mediaMap = await readMediaMap(source, entries, compressedMedia);
  const mediaEntries = new Map<string, ZipEntry>();
  for (const [name, member] of mediaMap) {
    const entry = entries.get(member);
    if (entry) mediaEntries.set(name, entry);
  }
  collection.mediaNames = [...mediaEntries.keys()];

  return {
    collection,
    async readMedia(name) {
      const entry = mediaEntries.get(name);
      if (!entry) return null;
      const bytes = await readZipEntry(source, entry);
      return compressedMedia ? decompressZstd(bytes) : bytes;
    },
  };
}

function pickCollection(entries: Map<string, ZipEntry>) {
  for (const format of ["anki21b", "anki21", "anki2"] as const) {
    const name = `collection.${format}`;
    if (entries.has(name)) return { name, format: format as AnkiPackageFormat };
  }
  throw new AnkiImportError(
    "This ZIP file isn't an Anki package: it has no collection. Choose an .apkg or .colpkg exported from Anki.",
  );
}

function packageVersion(bytes: Uint8Array) {
  try {
    for (const field of readProtoFields(bytes)) {
      if (field.number === 1 && field.varint !== undefined) return field.varint;
    }
  } catch {
    // An unreadable meta file is treated like a legacy package.
  }
  return 0;
}

function decompressZstd(bytes: Uint8Array) {
  try {
    return zstdDecompress(bytes);
  } catch {
    throw new AnkiImportError(
      "This file is damaged or incomplete, so it can't be read. Export the deck from Anki again and retry.",
    );
  }
}

// --- Media ---

/** Maps media file name → ZIP member name. */
async function readMediaMap(
  source: ByteSource,
  entries: Map<string, ZipEntry>,
  compressed: boolean,
) {
  const map = new Map<string, string>();
  const mediaFile = entries.get("media");
  if (!mediaFile) return map;
  const raw = await readZipEntry(source, mediaFile);

  if (!compressed) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new AnkiImportError("This package's media list is unreadable.");
    }
    if (parsed && typeof parsed === "object") {
      for (const [member, name] of Object.entries(parsed)) {
        if (typeof name === "string") map.set(name, member);
      }
    }
    return map;
  }

  // MediaEntries { repeated MediaEntry entries = 1 }
  // MediaEntry { string name = 1; uint32 size = 2; bytes sha1 = 3; optional uint32 legacy_zip_filename = 255 }
  try {
    let index = 0;
    for (const entry of readProtoFields(decompressZstd(raw))) {
      if (entry.number !== 1 || !entry.bytes) continue;
      let name = "";
      let legacyMember: number | undefined;
      for (const field of readProtoFields(entry.bytes)) {
        if (field.number === 1) name = protoString(field);
        else if (field.number === 255) legacyMember = field.varint;
      }
      if (name) map.set(name, String(legacyMember ?? index));
      index++;
    }
  } catch (error) {
    if (error instanceof AnkiImportError) throw error;
    throw new AnkiImportError("This package's media list is unreadable.");
  }
  return map;
}

// --- Collection database ---

function readCollection(
  SQL: SqlJsStatic,
  bytes: Uint8Array,
  format: AnkiPackageFormat,
): AnkiCollection {
  let db: Database;
  try {
    db = new SQL.Database(bytes);
  } catch {
    throw new AnkiImportError("This package's collection isn't a readable Anki database.");
  }
  try {
    const tables = new Set(
      rows(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => String(row[0])),
    );
    if (!tables.has("col") || !tables.has("notes") || !tables.has("cards")) {
      throw new AnkiImportError("This package's collection isn't a readable Anki database.");
    }
    const [col] = rows(db, "SELECT ver, crt FROM col LIMIT 1");
    if (!col)
      throw new AnkiImportError("This package's collection isn't a readable Anki database.");
    if (Number(col[0]) > MAX_SCHEMA_VERSION) {
      throw new AnkiImportError(
        "This package uses a newer Anki database version than Armin supports. Export it again using “Support older Anki versions”.",
      );
    }

    const modern = tables.has("notetypes");
    let notetypes: AnkiNotetype[];
    let decks: AnkiDeck[];
    if (modern) {
      withReadableCollations(db);
      notetypes = readModernNotetypes(db);
      decks = readModernDecks(db);
    } else {
      ({ notetypes, decks } = readLegacyModels(db));
    }

    return {
      format,
      createdAt: Number(col[1]),
      notetypes,
      decks,
      notes: readNotes(db),
      cards: readCards(db),
      revlog: tables.has("revlog") ? readRevlog(db) : [],
      mediaNames: [],
    };
  } catch (error) {
    if (error instanceof AnkiImportError) throw error;
    throw new AnkiImportError("This package's collection isn't a readable Anki database.");
  } finally {
    db.close();
  }
}

function* stepRows(db: Database, sql: string) {
  const statement = db.prepare(sql);
  try {
    while (statement.step()) yield statement.get();
  } finally {
    statement.free();
  }
}

function rows(db: Database, sql: string) {
  return [...stepRows(db, sql)];
}

/**
 * Schema 18 declares its name columns `COLLATE unicase`, a collation only Anki
 * registers, so sql.js can't plan queries over `fields` or `templates`. The
 * collation only orders name lookups, which we never run: drop those indexes,
 * strip the clause from the stored schema, and reopen so SQLite reparses it
 * (`export()` does that in sql.js).
 */
function withReadableCollations(db: Database) {
  const [count] = rows(db, "SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%COLLATE unicase%'");
  if (Number(count?.[0]) === 0) return;
  for (const [name] of rows(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL",
  )) {
    db.run(`DROP INDEX "${String(name).replaceAll('"', '""')}"`);
  }
  db.run("PRAGMA writable_schema = ON");
  db.run(
    "UPDATE sqlite_master SET sql = replace(sql, ' COLLATE unicase', '') WHERE sql LIKE '%COLLATE unicase%'",
  );
  db.run("PRAGMA writable_schema = OFF");
  db.export();
}

// --- Schema 18 (current) ---

function readModernNotetypes(db: Database): AnkiNotetype[] {
  const fields = new Map<string, { ord: number; name: string }[]>();
  for (const [ntid, ord, name] of stepRows(
    db,
    "SELECT CAST(ntid AS TEXT), ord, name FROM fields",
  )) {
    const list = fields.get(String(ntid)) ?? [];
    list.push({ ord: Number(ord), name: String(name) });
    fields.set(String(ntid), list);
  }

  const templates = new Map<string, AnkiTemplate[]>();
  for (const [ntid, ord, name, config] of stepRows(
    db,
    "SELECT CAST(ntid AS TEXT), ord, name, config FROM templates",
  )) {
    let qfmt = "";
    let afmt = "";
    for (const field of readProtoFields(config as Uint8Array)) {
      if (field.number === 1) qfmt = protoString(field);
      else if (field.number === 2) afmt = protoString(field);
    }
    const list = templates.get(String(ntid)) ?? [];
    list.push({ ord: Number(ord), name: String(name), qfmt, afmt });
    templates.set(String(ntid), list);
  }

  return rows(db, "SELECT CAST(id AS TEXT), name, config FROM notetypes").map(
    ([id, name, config]) => {
      // Notetype.Config { Kind kind = 1; ...; OriginalStockKind original_stock_kind = 9 }
      let kind = 0;
      let stockKind = 0;
      for (const field of readProtoFields(config as Uint8Array)) {
        if (field.number === 1) kind = field.varint ?? 0;
        else if (field.number === 9) stockKind = field.varint ?? 0;
      }
      return {
        id: String(id),
        name: String(name),
        kind: kind === 1 ? "cloze" : "standard",
        stockKind,
        fields: (fields.get(String(id)) ?? []).sort((a, b) => a.ord - b.ord),
        templates: (templates.get(String(id)) ?? []).sort((a, b) => a.ord - b.ord),
      };
    },
  );
}

function readModernDecks(db: Database): AnkiDeck[] {
  const decks: AnkiDeck[] = [];
  for (const [id, name, kind] of stepRows(db, "SELECT CAST(id AS TEXT), name, kind FROM decks")) {
    // Deck.kind oneof { Normal normal = 1; Filtered filtered = 2 }. Filtered
    // decks only borrow cards; the cards are attributed to their home deck.
    let filtered = false;
    for (const field of readProtoFields(kind as Uint8Array)) {
      if (field.number === 2) filtered = true;
    }
    if (!filtered) {
      decks.push({ id: String(id), name: String(name).replaceAll(NAME_SEPARATOR, "::") });
    }
  }
  return decks;
}

// --- Schema 11 (legacy) ---

type LegacyModel = {
  name?: string;
  type?: number;
  originalStockKind?: number;
  flds?: { name?: string; ord?: number }[];
  tmpls?: { name?: string; ord?: number; qfmt?: string; afmt?: string }[];
};

type LegacyDeck = { name?: string; dyn?: number };

function parseJsonColumn<T>(text: unknown): Record<string, T> {
  try {
    const parsed: unknown = JSON.parse(String(text));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function readLegacyModels(db: Database) {
  const [col] = rows(db, "SELECT models, decks FROM col LIMIT 1");
  // Object keys are the exact id strings; the inner `id` numbers can lose precision.
  const models = parseJsonColumn<LegacyModel>(col?.[0]);
  const deckMap = parseJsonColumn<LegacyDeck>(col?.[1]);

  const notetypes: AnkiNotetype[] = Object.entries(models).map(([id, model], index) => ({
    id,
    name: model.name ?? `Notetype ${index + 1}`,
    kind: model.type === 1 ? "cloze" : "standard",
    stockKind: typeof model.originalStockKind === "number" ? model.originalStockKind : null,
    fields: (model.flds ?? [])
      .map((field, i) => ({ ord: field.ord ?? i, name: field.name ?? `Field ${i + 1}` }))
      .sort((a, b) => a.ord - b.ord),
    templates: (model.tmpls ?? [])
      .map((template, i) => ({
        ord: template.ord ?? i,
        name: template.name ?? `Card ${i + 1}`,
        qfmt: template.qfmt ?? "",
        afmt: template.afmt ?? "",
      }))
      .sort((a, b) => a.ord - b.ord),
  }));

  const decks: AnkiDeck[] = Object.entries(deckMap)
    .filter(([, deck]) => !deck.dyn)
    .map(([id, deck]) => ({ id, name: deck.name ?? `Deck ${id}` }));
  return { notetypes, decks };
}

// --- Shared tables ---

function readNotes(db: Database): AnkiNote[] {
  const notes: AnkiNote[] = [];
  for (const [id, mid, tags, flds] of stepRows(
    db,
    "SELECT CAST(id AS TEXT), CAST(mid AS TEXT), tags, flds FROM notes",
  )) {
    notes.push({
      id: String(id),
      notetypeId: String(mid),
      fields: String(flds).split("\x1f"),
      tags: String(tags).split(/\s+/).filter(Boolean),
    });
  }
  return notes;
}

/** Cards parked in a filtered deck report their home deck and original due. */
function readCards(db: Database): AnkiCard[] {
  const cards: AnkiCard[] = [];
  for (const row of stepRows(
    db,
    `SELECT CAST(id AS TEXT), CAST(nid AS TEXT),
            CAST(CASE WHEN odid != 0 THEN odid ELSE did END AS TEXT),
            ord, type, queue, CASE WHEN odid != 0 THEN odue ELSE due END,
            ivl, factor, reps, lapses, data
       FROM cards`,
  )) {
    cards.push({
      id: String(row[0]),
      noteId: String(row[1]),
      deckId: String(row[2]),
      ord: Number(row[3]),
      type: Number(row[4]),
      queue: Number(row[5]),
      due: Number(row[6]),
      ivl: Number(row[7]),
      factor: Number(row[8]),
      reps: Number(row[9]),
      lapses: Number(row[10]),
      data: String(row[11] ?? ""),
    });
  }
  return cards;
}

function readRevlog(db: Database): AnkiReview[] {
  const reviews: AnkiReview[] = [];
  for (const row of stepRows(
    db,
    "SELECT id, CAST(cid AS TEXT), ease, ivl, lastIvl, factor, type FROM revlog",
  )) {
    reviews.push({
      id: Number(row[0]),
      cardId: String(row[1]),
      ease: Number(row[2]),
      ivl: Number(row[3]),
      lastIvl: Number(row[4]),
      factor: Number(row[5]),
      type: Number(row[6]),
    });
  }
  return reviews;
}
