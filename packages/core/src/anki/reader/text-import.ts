/**
 * Reads Anki's "Notes in Plain Text" export and simple delimited spreadsheets
 * (`.txt`, `.csv`, `.tsv`) into an {@link AnkiCollection}.
 *
 * Plain-text files carry no notetypes or scheduling, so notetypes are
 * synthesized (Basic family or Cloze) and every card is new.
 */

import type {
  AnkiCard,
  AnkiCollection,
  AnkiDeck,
  AnkiField,
  AnkiNote,
  AnkiNotetype,
  AnkiTemplate,
} from "../types";
import { AnkiImportError } from "./errors";

const SEPARATOR_NAMES: Record<string, string> = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
  pipe: "|",
  colon: ":",
  space: " ",
};

const CLOZE_PATTERN = /\{\{c\d+::/i;
const HEADER_ROW_WORDS = new Set([
  "front",
  "back",
  "question",
  "answer",
  "term",
  "definition",
  "text",
  "extra",
  "back extra",
  "tags",
  "deck",
  "notetype",
  "type",
]);

type Directives = {
  separator?: string;
  html?: boolean;
  tagsColumn?: number;
  deckColumn?: number;
  notetypeColumn?: number;
  guidColumn?: number;
  deck?: string;
  notetype?: string;
  columns?: string[];
};

export function parseAnkiText(text: string, fileName: string): AnkiCollection {
  const source = text.replace(/^﻿/, "");
  const { directives, body } = readDirectives(source);
  const separator = directives.separator ?? guessSeparator(body, fileName);
  let table = parseDelimited(body, separator).filter((row) => row.some((cell) => cell.trim()));

  // Without directives, a first row of column titles ("Front,Back") isn't a card.
  if (
    !Object.keys(directives).length &&
    table.length > 1 &&
    table[0].length >= 2 &&
    table[0].every((cell) => HEADER_ROW_WORDS.has(cell.trim().toLowerCase()))
  ) {
    const header = table[0].map((cell) => cell.trim().toLowerCase());
    directives.tagsColumn = header.indexOf("tags") + 1 || undefined;
    directives.deckColumn = header.indexOf("deck") + 1 || undefined;
    directives.notetypeColumn =
      (header.includes("notetype") ? header.indexOf("notetype") : header.indexOf("type")) + 1 ||
      undefined;
    table = table.slice(1);
  }
  if (directives.columns && directives.tagsColumn === undefined) {
    const index = directives.columns.findIndex((name) => name.trim().toLowerCase() === "tags");
    if (index >= 0) directives.tagsColumn = index + 1;
  }
  if (table.length === 0) {
    throw new AnkiImportError("This text file has no notes to import.");
  }

  const special = new Set(
    [
      directives.tagsColumn,
      directives.deckColumn,
      directives.notetypeColumn,
      directives.guidColumn,
    ].filter((column): column is number => column !== undefined),
  );
  const cell = (row: string[], column: number | undefined) =>
    column === undefined ? "" : (row[column - 1] ?? "").trim();

  const defaultDeck = directives.deck?.trim() || fileStem(fileName);
  const html = directives.html ?? true;
  const toHtml = (value: string) => (html ? value : plainTextToHtml(value));

  type Parsed = {
    notetypeName: string;
    groupKey: string;
    deckName: string;
    fields: string[];
    tags: string[];
  };
  const parsed: Parsed[] = [];
  for (const row of table) {
    const fields = row.flatMap((value, index) => (special.has(index + 1) ? [] : [toHtml(value)]));
    if (fields.every((value) => !value.trim())) continue;
    const notetypeName = cell(row, directives.notetypeColumn) || directives.notetype?.trim() || "";
    // Rows without a notetype name pick Basic or Cloze from their own content.
    const groupKey =
      notetypeName || (fields.some((value) => CLOZE_PATTERN.test(value)) ? "\0cloze" : "\0basic");
    parsed.push({
      notetypeName,
      groupKey,
      deckName: cell(row, directives.deckColumn) || defaultDeck,
      fields,
      tags: cell(row, directives.tagsColumn).split(/\s+/).filter(Boolean),
    });
  }
  if (parsed.length === 0) throw new AnkiImportError("This text file has no notes to import.");

  // One synthesized notetype per distinct name (or one for the whole file).
  const groups = new Map<string, Parsed[]>();
  for (const note of parsed) {
    const group = groups.get(note.groupKey) ?? [];
    group.push(note);
    groups.set(note.groupKey, group);
  }
  const notetypes: AnkiNotetype[] = [];
  const notetypeIds = new Map<string, string>();
  for (const [groupKey, notes] of groups) {
    const id = `text-notetype-${notetypes.length + 1}`;
    notetypes.push(synthesizeNotetype(id, notes[0].notetypeName, notes));
    notetypeIds.set(groupKey, id);
  }

  const decks: AnkiDeck[] = [];
  const deckIds = new Map<string, string>();
  const deckIdFor = (name: string) => {
    let id = deckIds.get(name);
    if (!id) {
      id = `text-deck-${decks.length + 1}`;
      deckIds.set(name, id);
      decks.push({ id, name });
    }
    return id;
  };

  const notes: AnkiNote[] = [];
  const cards: AnkiCard[] = [];
  parsed.forEach((note, index) => {
    const notetype = notetypes.find((type) => type.id === notetypeIds.get(note.groupKey))!;
    const id = `text-note-${index + 1}`;
    notes.push({ id, notetypeId: notetype.id, fields: note.fields, tags: note.tags });
    const deckId = deckIdFor(note.deckName);
    for (const ord of cardOrds(notetype, note.fields)) {
      cards.push({
        id: `text-card-${index + 1}-${ord}`,
        noteId: id,
        deckId,
        ord,
        type: 0,
        queue: 0,
        due: cards.length + 1,
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        data: "",
      });
    }
  });

  return {
    format: "text",
    createdAt: Math.floor(Date.now() / 1000),
    notetypes,
    decks,
    notes,
    cards,
    revlog: [],
    mediaNames: [],
  };
}

// --- Header and delimiter parsing ---

function readDirectives(source: string) {
  const directives: Directives = {};
  const lines = source.split(/\r\n|\n|\r/);
  let consumed = 0;
  for (const line of lines) {
    if (!line.startsWith("#")) break;
    consumed += 1;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(1, colon).trim().toLowerCase();
    const value = line.slice(colon + 1);
    switch (key) {
      case "separator": {
        const name = value.trim().toLowerCase();
        directives.separator = SEPARATOR_NAMES[name] ?? (value.length > 0 ? value : undefined);
        break;
      }
      case "html":
        directives.html = value.trim().toLowerCase() === "true";
        break;
      case "tags column":
        directives.tagsColumn = positiveInt(value);
        break;
      case "deck column":
        directives.deckColumn = positiveInt(value);
        break;
      case "notetype column":
        directives.notetypeColumn = positiveInt(value);
        break;
      case "guid column":
        directives.guidColumn = positiveInt(value);
        break;
      case "deck":
        directives.deck = value;
        break;
      case "notetype":
        directives.notetype = value;
        break;
      case "columns":
        // Names are split below once the separator is known.
        directives.columns = [value];
        break;
    }
  }
  if (directives.columns) {
    directives.columns = directives.columns[0].split(directives.separator ?? "\t");
  }
  return { directives, body: lines.slice(consumed).join("\n") };
}

function positiveInt(value: string) {
  const number = Number.parseInt(value.trim(), 10);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function guessSeparator(body: string, fileName: string) {
  const firstLine = body.split("\n", 1)[0] ?? "";
  if (firstLine.includes("\t")) return "\t";
  if (/\.tsv$/i.test(fileName)) return "\t";
  const counts = [",", ";", "|"].map(
    (candidate) => [candidate, count(firstLine, candidate)] as const,
  );
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (best[1] > 0) return best[0];
  return /\.csv$/i.test(fileName) ? "," : "\t";
}

function count(text: string, character: string) {
  return text.split(character).length - 1;
}

/** RFC 4180-style parsing: quoted fields, `""` escapes, embedded newlines. */
function parseDelimited(text: string, separator: string) {
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let atFieldStart = true;
  const endField = () => {
    row.push(field);
    field = "";
    atFieldStart = true;
  };
  const endRow = () => {
    endField();
    table.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (text.startsWith(separator, i)) {
      endField();
      i += separator.length - 1;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += char;
      atFieldStart = false;
    }
  }
  if (field || row.length > 0) endRow();
  return table;
}

function fileStem(fileName: string) {
  const stem = fileName.replace(/\.[^.]*$/, "").trim();
  return stem || "Imported notes";
}

/** Anki turns plain-text imports into HTML by escaping markup and converting newlines. */
function plainTextToHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\r\n|\n|\r/g, "<br>");
}

// --- Notetype synthesis ---

type StockShape = { stockKind: number; fieldNames: string[]; templates: AnkiTemplate[] };

const BASIC_BACK = "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}";

function stockShape(name: string, hasCloze: boolean): StockShape {
  const normalized = name.trim().toLowerCase();
  const stock = [
    "basic (and reversed card)",
    "basic (optional reversed card)",
    "basic (type in the answer)",
    "basic",
  ].includes(normalized);
  if (normalized.includes("cloze") || (!stock && hasCloze)) {
    return {
      stockKind: 5,
      fieldNames: ["Text", "Back Extra"],
      templates: [
        {
          ord: 0,
          name: "Cloze",
          qfmt: "{{cloze:Text}}",
          afmt: "{{cloze:Text}}<br>\n{{Back Extra}}",
        },
      ],
    };
  }
  if (normalized === "basic (and reversed card)") {
    return {
      stockKind: 2,
      fieldNames: ["Front", "Back"],
      templates: [
        { ord: 0, name: "Card 1", qfmt: "{{Front}}", afmt: BASIC_BACK },
        {
          ord: 1,
          name: "Card 2",
          qfmt: "{{Back}}",
          afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        },
      ],
    };
  }
  if (normalized === "basic (optional reversed card)") {
    return {
      stockKind: 3,
      fieldNames: ["Front", "Back", "Add Reverse"],
      templates: [
        { ord: 0, name: "Card 1", qfmt: "{{Front}}", afmt: BASIC_BACK },
        {
          ord: 1,
          name: "Card 2",
          qfmt: "{{#Add Reverse}}{{Back}}{{/Add Reverse}}",
          afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        },
      ],
    };
  }
  if (normalized === "basic (type in the answer)") {
    return {
      stockKind: 4,
      fieldNames: ["Front", "Back"],
      templates: [
        {
          ord: 0,
          name: "Card 1",
          qfmt: "{{Front}}\n\n{{type:Back}}",
          afmt: "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}",
        },
      ],
    };
  }
  return {
    stockKind: 1,
    fieldNames: ["Front", "Back"],
    templates: [{ ord: 0, name: "Card 1", qfmt: "{{Front}}", afmt: BASIC_BACK }],
  };
}

function synthesizeNotetype(id: string, name: string, notes: { fields: string[] }[]): AnkiNotetype {
  const hasCloze = notes.some((note) => note.fields.some((value) => CLOZE_PATTERN.test(value)));
  const shape = stockShape(name, hasCloze);
  const width = Math.max(shape.fieldNames.length, ...notes.map((note) => note.fields.length));
  const fieldNames = [...shape.fieldNames];
  while (fieldNames.length < width) fieldNames.push(`Field ${fieldNames.length + 1}`);
  const fields: AnkiField[] = fieldNames.map((fieldName, ord) => ({ ord, name: fieldName }));

  // Columns beyond the stock shape show on the back so no text is dropped.
  const extras = fieldNames.slice(shape.fieldNames.length).map((extra) => `{{${extra}}}`);
  const templates = shape.templates.map((template) => ({
    ...template,
    afmt: extras.length ? `${template.afmt}<br>\n${extras.join("<br>\n")}` : template.afmt,
  }));

  return {
    id,
    name: name.trim() || (shape.stockKind === 5 ? "Cloze" : "Basic"),
    kind: shape.stockKind === 5 ? "cloze" : "standard",
    stockKind: shape.stockKind,
    fields,
    templates,
  };
}

/** Which card ords a note generates, mirroring Anki's rules for the stock kinds. */
function cardOrds(notetype: AnkiNotetype, fields: string[]) {
  if (notetype.kind === "cloze") {
    const numbers = new Set<number>();
    for (const value of fields) {
      for (const match of value.matchAll(/\{\{c(\d+)::/gi)) numbers.add(Number(match[1]));
    }
    const ords = [...numbers].filter((n) => n > 0).map((n) => n - 1);
    return ords.sort((a, b) => a - b);
  }
  if (notetype.stockKind === 3) return fields[2]?.trim() ? [0, 1] : [0];
  return notetype.templates.map((template) => template.ord);
}
