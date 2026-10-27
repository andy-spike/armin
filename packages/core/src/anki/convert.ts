import {
  generateReviewUnits,
  validateContent,
  type FlashcardContent,
  type FlashcardType,
} from "../flashcard-types";
import { normalizeTags } from "../study";
import { convertAnkiCloze, dropEmptyClozes, limitClozeClusters } from "./cloze";
import { decodeEntities, htmlToMarkdown, inspectImage } from "./html";
import { classifyNotetype, type NotetypeKind } from "./notetype";
import { parseOcclusion } from "./occlusion";
import { scheduleCard } from "./schedule";
import { escapeHtml, isFieldEmpty, renderCard } from "./template";
import type {
  AnkiCard,
  AnkiCollection,
  AnkiNote,
  AnkiNotetype,
  ImportDeck,
  ImportFlashcard,
  ImportOptions,
  ImportPlan,
  ImportReviewUnit,
  ImportWarning,
  ImportWarningCode,
} from "./types";

// Mirrors the backend's library limits (packages/backend/convex/model/limits.ts),
// which core can't import.
const MAX_CONTENT_CHARS = 20_000;
const MAX_NAME_CHARS = 120;
const MAX_TAGS = 20;
const MAX_TAG_CHARS = 60;
const MAX_UNITS_PER_FLASHCARD = 60;

/** Length an `armin-media:` reference will have once a placeholder is swapped for it. */
const MEDIA_REF_LENGTH = "armin-media:".length + 64 + ".webp".length;

const PLACEHOLDER_RE = /anki-media:([^)\s"\\]+)/g;

/** Cut text to a length without splitting a surrogate pair. */
function cut(text: string, length: number) {
  const end = length > 0 && /[\ud800-\udbff]/.test(text[length - 1] ?? "") ? length - 1 : length;
  return text.slice(0, Math.max(0, end));
}

/** The Armin deck name for an Anki deck path. */
export function armDeckName(ankiPath: string) {
  const parts = ankiPath
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
  return cut(parts.join(" › ") || "Untitled", MAX_NAME_CHARS).trim() || "Untitled";
}

// --- Warnings ---

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const WARNING_MESSAGES: Record<ImportWarningCode, (count: number) => string> = {
  audio_removed: (n) => `Audio was removed from ${plural(n, "note")} (Armin has no audio yet).`,
  video_removed: (n) => `Video was removed from ${plural(n, "note")} (Armin has no video yet).`,
  unsupported_image_removed: (n) =>
    `Images in an unsupported format (such as SVG) were removed from ${plural(n, "note")}.`,
  missing_media: (n) => `Images missing from the package were removed from ${plural(n, "note")}.`,
  math_as_text: (n) => `Math in ${plural(n, "note")} is shown as plain text, not rendered.`,
  nested_cloze_flattened: (n) =>
    `Nested cloze deletions in ${plural(n, "note")} were flattened into separate deletions.`,
  shared_cloze_narrowed: (n) =>
    `Cloze deletions shared by several cards ({{c1,2::…}}) in ${plural(n, "note")} now belong to the first of those cards only.`,
  occlusion_shape_approximated: (n) =>
    `Occlusion shapes in ${plural(n, "note")} were approximated by rectangles.`,
  custom_notetype_rendered: (n) =>
    `${plural(n, "note")} with a custom notetype became basic flashcards from the rendered templates.`,
  audio_only_card_skipped: (n) =>
    `Cards that only play audio on the front were skipped in ${plural(n, "note")} (Armin has no audio yet).`,
  additional_fields_added: (n) =>
    `Additional cloze fields from ${plural(n, "note")} were added to the answer.`,
  additional_fields_omitted: (n) =>
    `Populated additional cloze fields in ${plural(n, "note")} could not be imported.`,
  required_content_card_skipped: (n) =>
    `Cards whose required front content could not be imported were skipped in ${plural(n, "note")}.`,
  empty_note_skipped: (n) =>
    `${plural(n, "note")} with empty required content (or an unusable image) was skipped.`,
  content_truncated: (n) => `${plural(n, "note")} exceeded Armin's size limits and was shortened.`,
  tags_trimmed: (n) => `Tags on ${plural(n, "note")} were shortened or limited to 20.`,
  scripts_removed: (n) => `Scripts and styles were removed from ${plural(n, "note")}.`,
};

// --- Content ---

type Content = { type: FlashcardType; content: FlashcardContent };

function mediaIn(content: FlashcardContent) {
  const names = new Set<string>();
  for (const match of JSON.stringify(content).matchAll(PLACEHOLDER_RE)) {
    try {
      names.add(decodeURIComponent(match[1]));
    } catch {
      names.add(match[1]);
    }
  }
  return [...names];
}

function contentSize(content: FlashcardContent) {
  return JSON.stringify(content).replace(PLACEHOLDER_RE, "x".repeat(MEDIA_REF_LENGTH)).length;
}

const SHRINKABLE: Record<FlashcardType, string[]> = {
  basic: ["front", "back"],
  basic_reversed: ["front", "back"],
  cloze: ["extra", "text"],
  type_answer: ["prompt"],
  image_occlusion: ["extra", "header"],
};

/** Remove a dangling cloze or image marker left at the end of cut text. */
function closeCut(text: string) {
  let out = text;
  const brace = out.lastIndexOf("{{");
  if (brace > out.lastIndexOf("}}")) out = out.slice(0, brace);
  const image = out.lastIndexOf("![");
  if (image > out.lastIndexOf(")")) out = out.slice(0, image);
  return `${out.replace(/[\\\s]+$/, "")}…`;
}

/** Shorten text fields until the serialized content fits the backend limit. */
function fitContent(type: FlashcardType, content: FlashcardContent) {
  let current = { ...content } as Record<string, unknown>;
  let truncated = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const excess = contentSize(current as FlashcardContent) - MAX_CONTENT_CHARS;
    if (excess <= 0) return { content: current as FlashcardContent, truncated };
    // Shorten the extra/secondary field first; otherwise the longest one.
    const fields = SHRINKABLE[type].filter(
      (key) => typeof current[key] === "string" && (current[key] as string).length > 1,
    );
    const target =
      type === "cloze" && fields.includes("extra")
        ? "extra"
        : fields.sort((a, b) => (current[b] as string).length - (current[a] as string).length)[0];
    if (!target) break;
    const value = current[target] as string;
    const shortened = closeCut(cut(value, value.length - excess - 16));
    current = { ...current, [target]: shortened.length > 1 ? shortened : "" };
    truncated = true;
    if (!current[target]) delete current[target];
  }
  return { content: current as FlashcardContent, truncated };
}

type NoteContext = {
  fieldNames: string[];
  mediaNames: ReadonlySet<string>;
  warnings: Set<ImportWarningCode>;
  /** Markdown for a field; `plain` for fields Armin shows without Markdown. */
  md: (html: string, plain?: boolean) => string;
};

type Prepared =
  | { ok: true; flashcards: { content: Content; ord: number | null }[] }
  | { ok: false };

const EMPTY: Prepared = { ok: false };

/** Build the Armin content for a note whose notetype maps to a fixed type. */
function prepareStandard(note: AnkiNote, kind: NotetypeKind, ctx: NoteContext): Prepared {
  const field = (index: number | null) => (index === null ? "" : (note.fields[index] ?? ""));
  switch (kind.kind) {
    case "basic":
    case "basic_reversed":
    case "optional_reversed": {
      const front = ctx.md(field(kind.front));
      const back = ctx.md(field(kind.back));
      if (!front || !back) return EMPTY;
      const reversed =
        kind.kind === "basic_reversed" ||
        (kind.kind === "optional_reversed" && !isFieldEmpty(field(kind.reverse)));
      return {
        ok: true,
        flashcards: [
          {
            ord: null,
            content: { type: reversed ? "basic_reversed" : "basic", content: { front, back } },
          },
        ],
      };
    }
    case "type_answer": {
      const prompt = ctx.md(field(kind.front));
      const answer = ctx.md(field(kind.answer), true).trim();
      if (!prompt || !answer) return EMPTY;
      return {
        ok: true,
        flashcards: [
          {
            ord: null,
            content: {
              type: "type_answer",
              content: { prompt, answer, acceptedAnswers: [] },
            },
          },
        ],
      };
    }
    case "cloze":
      return prepareCloze(note, kind, ctx);
    case "image_occlusion":
      return prepareOcclusion(note, kind, ctx);
    case "custom":
      return EMPTY;
  }
}

function prepareCloze(
  note: AnkiNote,
  kind: Extract<NotetypeKind, { kind: "cloze" }>,
  ctx: NoteContext,
): Prepared {
  const converted = convertAnkiCloze(note.fields[kind.text] ?? "");
  if (converted.nested) ctx.warnings.add("nested_cloze_flattened");
  if (converted.shared) ctx.warnings.add("shared_cloze_narrowed");
  let text = dropEmptyClozes(ctx.md(converted.text));
  const limited = limitClozeClusters(text, MAX_UNITS_PER_FLASHCARD);
  if (limited.trimmed) ctx.warnings.add("content_truncated");
  text = limited.text;
  if (!text.trim()) return EMPTY;
  const extraParts = [kind.extra === null ? "" : ctx.md(note.fields[kind.extra] ?? "")];
  for (const [index, field] of note.fields.entries()) {
    if (index === kind.text || index === kind.extra) continue;
    const markdown = ctx.md(field);
    if (!markdown.trim()) {
      if (!isFieldEmpty(field)) ctx.warnings.add("additional_fields_omitted");
      continue;
    }
    const label = ctx.md(escapeHtml(ctx.fieldNames[index] || `Field ${index + 1}`));
    extraParts.push(`### ${label}\n\n${markdown}`);
    ctx.warnings.add("additional_fields_added");
  }
  const extra = extraParts.filter(Boolean).join("\n\n");
  return {
    ok: true,
    flashcards: [
      {
        ord: null,
        content: {
          type: "cloze",
          content: { text, ...(extra ? { extra } : {}) } as FlashcardContent,
        },
      },
    ],
  };
}

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

function prepareOcclusion(
  note: AnkiNote,
  kind: Extract<NotetypeKind, { kind: "image_occlusion" }>,
  ctx: NoteContext,
): Prepared {
  const parsed = parseOcclusion(note.fields[kind.occlusion] ?? "");
  const source = IMG_SRC_RE.exec(note.fields[kind.image] ?? "");
  if (parsed.masks.length === 0 || !source) return EMPTY;
  const image = inspectImage(
    decodeEntities(source[1] ?? source[2] ?? source[3] ?? ""),
    ctx.mediaNames,
  );
  if (!image.ok) {
    ctx.warnings.add(image.reason);
    return EMPTY;
  }
  const masks = parsed.masks.slice(0, MAX_UNITS_PER_FLASHCARD);
  if (masks.length < parsed.masks.length) ctx.warnings.add("content_truncated");
  if (masks.some((mask) => mask.approximated)) ctx.warnings.add("occlusion_shape_approximated");
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  const header = kind.header === null ? "" : ctx.md(note.fields[kind.header] ?? "", true);
  const extra = kind.extra === null ? "" : ctx.md(note.fields[kind.extra] ?? "", true);
  return {
    ok: true,
    flashcards: [
      {
        ord: null,
        content: {
          type: "image_occlusion",
          content: {
            baseImage: image.placeholder,
            masks: masks.map((mask) => ({
              id: `c${mask.num}`,
              geometry: {
                x: round(mask.box.x),
                y: round(mask.box.y),
                w: round(mask.box.w),
                h: round(mask.box.h),
              },
            })),
            ...(header ? { header } : {}),
            ...(extra ? { extra } : {}),
            revealMode: parsed.hideAll ? "hide_all" : "hide_one",
          },
        },
      },
    ],
  };
}

// --- Tags ---

function convertTags(tags: string[]) {
  let trimmed = false;
  const shortened = normalizeTags(tags).map((tag) => {
    if (tag.length <= MAX_TAG_CHARS) return tag;
    trimmed = true;
    return cut(tag, MAX_TAG_CHARS).trim();
  });
  const unique = normalizeTags(shortened);
  if (unique.length > MAX_TAGS) trimmed = true;
  return { tags: unique.slice(0, MAX_TAGS), trimmed };
}

// --- Card ↔ review unit mapping ---

function ordForSubKey(type: FlashcardType, subKey: string, templateOrd: number | null) {
  if (type === "cloze" || type === "image_occlusion") {
    const number = Number(subKey.slice(1));
    return Number.isInteger(number) && number >= 1 ? number - 1 : null;
  }
  if (type === "basic_reversed" && subKey === "rev") return 1;
  return templateOrd ?? 0;
}

// --- Conversion ---

type Draft = ImportFlashcard;

export function convertAnkiCollection(
  collection: AnkiCollection,
  options: ImportOptions,
): ImportPlan {
  const mediaNames = new Set(collection.mediaNames);
  const notetypes = new Map(collection.notetypes.map((nt) => [nt.id, nt]));
  const decks = new Map(collection.decks.map((deck) => [deck.id, deck]));
  const wantedDecks = options.deckIds ? new Set(options.deckIds) : null;

  const cardsByNote = new Map<string, AnkiCard[]>();
  for (const card of collection.cards) {
    if (wantedDecks && !wantedDecks.has(card.deckId)) continue;
    const list = cardsByNote.get(card.noteId);
    if (list) list.push(card);
    else cardsByNote.set(card.noteId, [card]);
  }

  const reviewsByCard = new Map<string, typeof collection.revlog>();
  if (options.progress === "keep") {
    for (const review of collection.revlog) {
      const list = reviewsByCard.get(review.cardId);
      if (list) list.push(review);
      else reviewsByCard.set(review.cardId, [review]);
    }
  }

  const notesByType = new Map<string, AnkiNote[]>();
  for (const note of collection.notes) {
    const list = notesByType.get(note.notetypeId);
    if (list) list.push(note);
    else notesByType.set(note.notetypeId, [note]);
  }
  const kinds = new Map<string, NotetypeKind>();
  const kindOf = (notetype: AnkiNotetype) => {
    let kind = kinds.get(notetype.id);
    if (!kind) {
      kind = classifyNotetype(notetype, notesByType.get(notetype.id) ?? []);
      kinds.set(notetype.id, kind);
    }
    return kind;
  };

  const warningCounts = new Map<ImportWarningCode, number>();
  const countWarnings = (codes: Iterable<ImportWarningCode>) => {
    for (const code of codes) warningCounts.set(code, (warningCounts.get(code) ?? 0) + 1);
  };

  const drafts: Draft[] = [];

  for (const note of collection.notes) {
    const cards = cardsByNote.get(note.id)?.sort((a, b) => a.ord - b.ord);
    if (!cards?.length) continue;
    const notetype = notetypes.get(note.notetypeId);
    const warnings = new Set<ImportWarningCode>();
    if (!notetype) {
      countWarnings(["empty_note_skipped"]);
      continue;
    }

    const ctx: NoteContext = {
      fieldNames: notetype.fields.map((field) => field.name),
      mediaNames,
      warnings,
      md: (html, plain = false) =>
        htmlToMarkdown(html, {
          mediaNames,
          warn: (code) => warnings.add(code),
          plain,
        }).markdown,
    };
    const kind = kindOf(notetype);

    const candidates: {
      content: Content;
      cards: AnkiCard[];
      key: string;
      templateOrd: number | null;
    }[] = [];
    if (kind.kind === "custom") {
      const fields = new Map(notetype.fields.map((field, i) => [field.name, note.fields[i] ?? ""]));
      for (const card of cards) {
        const template =
          notetype.templates.find((t) => t.ord === card.ord) ?? notetype.templates[card.ord];
        if (!template) continue;
        const deckName = decks.get(card.deckId)?.name ?? "Default";
        const rendered = renderCard(notetype, template, {
          fields,
          tags: note.tags.join(" "),
          deck: deckName,
          subdeck: deckName.split("::").pop() ?? deckName,
          clozeNum: card.ord + 1,
          fieldIsUsable: (html) => Boolean(ctx.md(html).trim()),
        });
        if (!rendered) continue;
        if ("audioOnly" in rendered) {
          warnings.add("audio_only_card_skipped");
          continue;
        }
        if ("unusableFront" in rendered) {
          warnings.add("required_content_card_skipped");
          continue;
        }
        const front = ctx.md(rendered.front);
        const back = ctx.md(rendered.back);
        if (!front || !back) continue;
        candidates.push({
          content: { type: "basic", content: { front, back } },
          cards: [card],
          key: `${note.id}:${card.ord}`,
          templateOrd: card.ord,
        });
      }
      if (candidates.length > 0) warnings.add("custom_notetype_rendered");
    } else {
      const prepared = prepareStandard(note, kind, ctx);
      if (prepared.ok) {
        for (const item of prepared.flashcards) {
          candidates.push({ content: item.content, cards, key: note.id, templateOrd: null });
        }
      }
    }

    const { tags, trimmed } = convertTags(note.tags);
    let produced = 0;
    for (const candidate of candidates) {
      const draft = finishFlashcard(candidate, tags, collection, options, reviewsByCard, warnings);
      if (!draft) continue;
      drafts.push(draft);
      produced++;
    }
    if (produced === 0) {
      // Only the image problems explain why the note was skipped.
      const reasons = (["missing_media", "unsupported_image_removed"] as const).filter((code) =>
        warnings.has(code),
      );
      countWarnings(["empty_note_skipped", ...reasons]);
      continue;
    }
    if (trimmed) warnings.add("tags_trimmed");
    countWarnings(warnings);
  }

  return buildPlan(collection, decks, drafts, warningCounts);
}

function finishFlashcard(
  candidate: { content: Content; cards: AnkiCard[]; key: string; templateOrd: number | null },
  tags: string[],
  collection: AnkiCollection,
  options: ImportOptions,
  reviewsByCard: Map<string, AnkiCollection["revlog"]>,
  warnings: Set<ImportWarningCode>,
): Draft | null {
  const { type } = candidate.content;
  let content: FlashcardContent;
  try {
    content = validateContent(type, candidate.content.content);
    const fitted = fitContent(type, content);
    if (fitted.truncated) {
      warnings.add("content_truncated");
      content = validateContent(type, fitted.content);
    }
    if (contentSize(content) > MAX_CONTENT_CHARS) return null;
  } catch {
    return null;
  }

  const specs = generateReviewUnits(type, content);
  if (specs.length === 0 || specs.length > MAX_UNITS_PER_FLASHCARD) return null;

  const byOrd = new Map(candidate.cards.map((card) => [card.ord, card]));
  const units: ImportReviewUnit[] = specs.map((spec) => {
    const ord = ordForSubKey(type, spec.subKey, candidate.templateOrd);
    const card = ord === null ? undefined : byOrd.get(ord);
    if (!card || options.progress !== "keep")
      return { subKey: spec.subKey, schedule: null, logs: [] };
    const { schedule, logs } = scheduleCard(
      card,
      reviewsByCard.get(card.id) ?? [],
      collection.createdAt,
    );
    return { subKey: spec.subKey, schedule, logs };
  });

  return {
    key: candidate.key,
    deckKey: candidate.cards[0].deckId,
    type,
    content,
    tags,
    archived: candidate.cards.every((card) => card.queue === -1),
    units,
    media: mediaIn(content),
  };
}

function buildPlan(
  collection: AnkiCollection,
  decks: Map<string, { id: string; name: string }>,
  drafts: Draft[],
  warningCounts: Map<ImportWarningCode, number>,
): ImportPlan {
  const counts = new Map<string, number>();
  for (const draft of drafts) counts.set(draft.deckKey, (counts.get(draft.deckKey) ?? 0) + 1);

  const importDecks: ImportDeck[] = [];
  const seen = new Set<string>();
  const add = (id: string, ankiName: string) => {
    const cardCount = counts.get(id) ?? 0;
    if (cardCount === 0 || seen.has(id)) return;
    seen.add(id);
    importDecks.push({ key: id, name: armDeckName(ankiName), ankiName, cardCount });
  };
  for (const deck of collection.decks) add(deck.id, deck.name);
  // Cards can point at a deck the package doesn't list; file them under "Default".
  for (const id of counts.keys()) add(id, decks.get(id)?.name ?? "Default");

  const warnings: ImportWarning[] = [...warningCounts]
    .map(([code, count]) => ({ code, count, message: WARNING_MESSAGES[code](count) }))
    .sort((a, b) => b.count - a.count);

  const byType: ImportPlan["totals"]["byType"] = {};
  const media = new Set<string>();
  let reviewUnits = 0;
  let reviewLogs = 0;
  for (const draft of drafts) {
    byType[draft.type] = (byType[draft.type] ?? 0) + 1;
    reviewUnits += draft.units.length;
    for (const unit of draft.units) reviewLogs += unit.logs.length;
    for (const name of draft.media) media.add(name);
  }

  return {
    decks: importDecks,
    flashcards: drafts,
    warnings,
    totals: {
      flashcards: drafts.length,
      reviewUnits,
      reviewLogs,
      mediaFiles: media.size,
      byType,
    },
  };
}
