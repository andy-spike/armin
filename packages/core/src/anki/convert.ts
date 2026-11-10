import {
  generateReviewUnits,
  validateContent,
  type FlashcardContent,
  type FlashcardType,
} from "../flashcard-types";
import {
  MAX_CONTENT_CHARS,
  MAX_IMPORT_REVIEW_LOGS,
  MAX_INTERVAL_MAX,
  MAX_NAME_CHARS,
  MAX_REVIEW_UNITS_PER_FLASHCARD,
  MAX_TAG_CHARS,
  MAX_TAGS_PER_FLASHCARD,
  RETENTION_MAX,
  RETENTION_MIN,
} from "../limits";
import { MAX_FLASHCARDS_PER_DECK, MAX_REVIEW_UNITS_PER_DECK } from "../plans";
import { normalizeTags } from "../study";
import { convertAnkiCloze, dropEmptyClozes, limitClozeClusters } from "./cloze";
import { decodeEntities, decodeMediaName, htmlToMarkdown, inspectImage } from "./html";
import { classifyNotetype, type NotetypeKind } from "./notetype";
import { parseOcclusion } from "./occlusion";
import { ioeGroupKey, prepareIoeGroup, sortIoeNotes } from "./occlusion-enhanced";
import { scheduleCard } from "./schedule";
import { escapeHtml, isFieldEmpty, renderCard, stripRepeatedFront, templateRefs } from "./template";
import type {
  AnkiCard,
  AnkiCollection,
  AnkiDeckConfig,
  ImportDeckSettings,
  NotetypeMapping,
  AnkiNote,
  AnkiDeck,
  AnkiNotetype,
  ImportDeck,
  ImportFlashcard,
  ImportOmitted,
  ImportOmittedReason,
  ImportOptions,
  ImportPlan,
  ImportReviewUnit,
  ImportWarning,
  ImportWarningCode,
} from "./types";

const MEDIA_REF_LENGTH = "armin-media:".length + 64 + ".webp".length;

const PLACEHOLDER_RE = /anki-media:([^)\s"\\]+)/g;

function cut(text: string, length: number) {
  const end = length > 0 && /[\ud800-\udbff]/.test(text[length - 1] ?? "") ? length - 1 : length;
  return text.slice(0, Math.max(0, end));
}

export function uniqueDeckNames(decks: readonly { name: string }[]) {
  const used = new Set<string>();
  return decks.map((deck) => {
    let name = deck.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      let base = deck.name.slice(0, MAX_NAME_CHARS - suffix.length);
      if (/[\ud800-\udbff]$/.test(base)) base = base.slice(0, -1);
      name = `${base.trimEnd()}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

export function armDeckName(ankiPath: string) {
  const parts = ankiPath
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
  return cut(parts.join(" › ") || "Untitled", MAX_NAME_CHARS).trim() || "Untitled";
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const WARNING_MESSAGES: Record<ImportWarningCode, (count: number) => string> = {
  math_unsupported: (n) =>
    `Equations in ${plural(n, "note")} contain invalid or unsupported math syntax; their source is kept with a warning.`,
  audio_removed: (n) =>
    `Audio in a format Armin can't play (such as WMA or AMR) was removed from ${plural(n, "note")}.`,
  tts_removed: (n) =>
    `Text-to-speech in ${plural(n, "note")} was left out; Armin plays recorded audio only.`,
  video_removed: (n) => `Video was removed from ${plural(n, "note")} (Armin doesn't play video).`,
  unsupported_image_removed: (n) =>
    `Images in an unsupported format (such as SVG) were removed from ${plural(n, "note")}.`,
  missing_media: (n) =>
    `Images or audio files missing from the package were removed from ${plural(n, "note")}.`,
  math_as_text: (n) =>
    `Legacy [latex] content in ${plural(n, "note")} is kept as source; full LaTeX documents are not supported.`,
  nested_cloze_flattened: (n) =>
    `Nested cloze deletions in ${plural(n, "note")} were flattened into separate deletions.`,
  shared_cloze_narrowed: (n) =>
    `Cloze deletions shared by several cards ({{c1,2::…}}) in ${plural(n, "note")} now belong to the first of those cards only.`,
  occlusion_shape_approximated: (n) =>
    `Occlusion shapes in ${plural(n, "note")} were approximated by rectangles.`,
  occlusion_labels_removed: (n) =>
    `Text labels drawn on occlusion images in ${plural(n, "note")} were left out; the masks are kept.`,
  custom_notetype_rendered: (n) =>
    `${plural(n, "note")} with a custom notetype became flashcards from the rendered templates.`,
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
  tags_trimmed: (n) =>
    `Tags on ${plural(n, "note")} were shortened or limited to ${MAX_TAGS_PER_FLASHCARD} per card.`,
  scripts_removed: (n) => `Scripts and styles were removed from ${plural(n, "note")}.`,
  flags_as_tags: (n) =>
    `Flags on ${plural(n, "note")} became tags such as flag::red, so you can still filter by them.`,
};

const FLAG_NAMES = ["", "red", "orange", "green", "blue", "pink", "turquoise", "purple"];

function flagTags(cards: AnkiCard[]) {
  const names = new Set<string>();
  for (const card of cards) {
    const name = FLAG_NAMES[(card.flags ?? 0) & 7];
    if (name) names.add(`flag::${name}`);
  }
  return [...names];
}

function formatSteps(minutes: number[] | null) {
  if (minutes === null) return null;
  if (minutes.length === 0) return "";
  const steps = minutes.filter((step) => Number.isFinite(step) && step > 0);
  if (steps.length === 0) return null;
  const amount = (value: number) => String(Math.round(value * 100) / 100);
  return steps
    .map((step) =>
      step >= 1440 && step % 1440 === 0
        ? `${amount(step / 1440)}d`
        : step >= 60 && step % 60 === 0
          ? `${amount(step / 60)}h`
          : `${amount(step)}m`,
    )
    .join(", ");
}

export function deckSettingsFromConfig(config: AnkiDeckConfig): ImportDeckSettings | undefined {
  const retention =
    config.desiredRetention === null ? null : Math.round(config.desiredRetention * 100) / 100;
  const params = config.fsrsParams.map((value) => Math.round(value * 10_000) / 10_000);
  const settings: ImportDeckSettings = {
    requestRetention:
      retention !== null && retention >= RETENTION_MIN && retention <= RETENTION_MAX
        ? retention
        : null,
    maximumInterval:
      config.maximumInterval !== null && config.maximumInterval >= 1
        ? Math.min(MAX_INTERVAL_MAX, Math.round(config.maximumInterval))
        : null,
    learningSteps: formatSteps(config.learnSteps),
    relearningSteps: formatSteps(config.relearnSteps),
    weights:
      [17, 19, 21].includes(params.length) && params.every(Number.isFinite)
        ? JSON.stringify(params)
        : null,
  };
  return Object.values(settings).some((value) => value !== null) ? settings : undefined;
}

type Content = { type: FlashcardType; content: FlashcardContent };

function mediaIn(content: FlashcardContent) {
  const names = new Set<string>();
  for (const match of JSON.stringify(content).matchAll(PLACEHOLDER_RE))
    names.add(decodeMediaName(match[1]));
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
  concept: [],
};

function closeCut(text: string) {
  let out = text;
  const brace = out.lastIndexOf("{{");
  if (brace > out.lastIndexOf("}}")) out = out.slice(0, brace);
  const image = out.lastIndexOf("![");
  if (image > out.lastIndexOf(")")) out = out.slice(0, image);
  return `${out.replace(/[\\\s]+$/, "")}…`;
}

function fitContent(type: FlashcardType, content: FlashcardContent) {
  let current = { ...content } as Record<string, unknown>;
  let truncated = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const excess = contentSize(current as FlashcardContent) - MAX_CONTENT_CHARS;
    if (excess <= 0) return { content: current as FlashcardContent, truncated };
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
  md: (html: string, plain?: boolean, templateFields?: readonly string[]) => string;
  svg: boolean;
};

type Prepared =
  | { ok: true; flashcards: { content: Content; ord: number | null }[] }
  | { ok: false };

const EMPTY: Prepared = { ok: false };

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
    case "image_occlusion_enhanced":
    case "unsupported_occlusion":
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
  const limited = limitClozeClusters(text, MAX_REVIEW_UNITS_PER_FLASHCARD);
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
    ctx.svg,
  );
  if (!image.ok) {
    ctx.warnings.add(image.reason);
    return EMPTY;
  }
  const masks = parsed.masks.slice(0, MAX_REVIEW_UNITS_PER_FLASHCARD);
  if (masks.length < parsed.masks.length) ctx.warnings.add("content_truncated");
  if (masks.some((mask) => mask.approximated)) ctx.warnings.add("occlusion_shape_approximated");
  if (parsed.labels > 0) ctx.warnings.add("occlusion_labels_removed");
  const markdown = (index: number | null) =>
    index === null ? "" : ctx.md(note.fields[index] ?? "").trim();
  const header = markdown(kind.header);
  const extra = [
    markdown(kind.extra),
    ...kind.others.map((index) => {
      const value = markdown(index);
      const name = ctx.md(escapeHtml(ctx.fieldNames[index]?.trim() || `Field ${index + 1}`));
      return value ? `**${name.trim()}**\n\n${value}` : "";
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
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
              geometry: mask.box,
              ...(mask.parts ? { parts: mask.parts } : {}),
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

function convertTags(tags: string[]) {
  let trimmed = false;
  const shortened = normalizeTags(tags).map((tag) => {
    if (tag.length <= MAX_TAG_CHARS) return tag;
    trimmed = true;
    return cut(tag, MAX_TAG_CHARS).trim();
  });
  const unique = normalizeTags(shortened);
  if (unique.length > MAX_TAGS_PER_FLASHCARD) trimmed = true;
  return { tags: unique.slice(0, MAX_TAGS_PER_FLASHCARD), trimmed };
}

function ordForSubKey(type: FlashcardType, subKey: string, templateOrd: number | null) {
  if (type === "cloze" || type === "image_occlusion") {
    const number = Number(subKey.slice(1));
    return Number.isInteger(number) && number >= 1 ? number - 1 : null;
  }
  if (type === "basic_reversed" && subKey === "rev") return 1;
  return templateOrd ?? 0;
}

type Draft = ImportFlashcard;

export function convertAnkiCollection(
  collection: AnkiCollection,
  options: ImportOptions,
): ImportPlan {
  const mediaNames = new Set(collection.mediaNames);
  const notetypes = new Map(collection.notetypes.map((nt) => [nt.id, nt]));
  const decks = new Map(collection.decks.map((deck) => [deck.id, deck]));
  const wantedDecks = options.deckIds ? new Set(options.deckIds) : null;

  const selectedCards = wantedDecks
    ? collection.cards.filter((card) => wantedDecks.has(card.deckId))
    : collection.cards;
  const cardsByNote = groupBy(selectedCards, (card) => card.noteId);
  const reviewsByCard =
    options.progress === "keep"
      ? groupBy(collection.revlog, (review) => review.cardId)
      : new Map<string, typeof collection.revlog>();
  const notesByType = groupBy(collection.notes, (note) => note.notetypeId);
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
  const omitted: ImportOmitted[] = [];
  const ioeGroups = new Map<
    string,
    {
      notetype: AnkiNotetype;
      kind: Extract<NotetypeKind, { kind: "image_occlusion_enhanced" }>;
      members: { note: AnkiNote; cards: AnkiCard[] }[];
    }
  >();

  const markdownFor =
    (warnings: Set<ImportWarningCode>) =>
    (html: string, plain = false, templateFields?: readonly string[]) =>
      htmlToMarkdown(html, {
        mediaNames,
        warn: (code) => warnings.add(code),
        plain,
        svg: options.rasterizeSvg,
        ...(templateFields ? { template: true, fieldValues: templateFields } : {}),
      }).markdown;

  const omit = (
    note: AnkiNote,
    deckId: string,
    notetypeName: string,
    reason: ImportOmittedReason,
    cardCount: number,
  ) => {
    omitted.push({
      noteId: note.id,
      notetypeId: note.notetypeId,
      notetypeName,
      deckId,
      cardCount,
      reason,
    });
  };

  for (const note of collection.notes) {
    const cards = cardsByNote.get(note.id)?.sort((a, b) => a.ord - b.ord);
    if (!cards?.length) continue;
    const notetype = notetypes.get(note.notetypeId);
    const warnings = new Set<ImportWarningCode>();
    if (!notetype) {
      countWarnings(["empty_note_skipped"]);
      omit(note, cards[0]!.deckId, "", "missing_notetype", cards.length);
      continue;
    }

    const ctx: NoteContext = {
      fieldNames: notetype.fields.map((field) => field.name),
      mediaNames,
      warnings,
      md: markdownFor(warnings),
      svg: Boolean(options.rasterizeSvg),
    };
    const kind = kindOf(notetype);
    if (kind.kind === "unsupported_occlusion") {
      countWarnings(["empty_note_skipped"]);
      omit(note, cards[0]!.deckId, notetype.name, "unsupported_occlusion", cards.length);
      continue;
    }
    if (kind.kind === "image_occlusion_enhanced") {
      const key = `${notetype.id}:${ioeGroupKey(note, kind)}`;
      const group = ioeGroups.get(key) ?? { notetype, kind, members: [] };
      group.members.push({ note, cards });
      ioeGroups.set(key, group);
      continue;
    }
    const mapping = options.notetypeMappings?.[notetype.id];

    let candidates: Candidate[] = [];
    if (kind.kind === "custom" && mapping && mapping.kind !== "template") {
      const content = mappedContent(note, mapping, ctx);
      if (content) candidates = [{ content, cards, key: note.id, templateOrd: cards[0]!.ord }];
    } else if (kind.kind === "custom") {
      candidates = renderCustomNotetypeCards(
        note,
        notetype,
        Boolean(kind.mirrored),
        cards,
        decks,
        ctx,
      );
      if (candidates.length > 0) warnings.add("custom_notetype_rendered");
    } else {
      const prepared = prepareStandard(note, kind, ctx);
      if (prepared.ok) {
        candidates = prepared.flashcards.map((item) => ({
          content: item.content,
          cards,
          key: note.id,
          templateOrd: null,
        }));
      }
    }

    const flags = flagTags(cards);
    if (flags.length > 0) warnings.add("flags_as_tags");
    const { tags, trimmed } = convertTags([...note.tags, ...flags]);
    let produced = 0;
    for (const candidate of candidates) {
      const draft = finishFlashcard(candidate, tags, collection, options, reviewsByCard, warnings);
      if (!draft) continue;
      draft.source = {
        noteId: note.id,
        notetypeId: note.notetypeId,
        ankiCardIds: candidate.cards.map((card) => card.id),
      };
      drafts.push(draft);
      produced++;
    }
    if (produced === 0) {
      const reasons = (["missing_media", "unsupported_image_removed"] as const).filter((code) =>
        warnings.has(code),
      );
      countWarnings(["empty_note_skipped", ...reasons]);
      const reason = omissionReason(warnings, kind.kind === "custom");
      omit(note, cards[0]!.deckId, notetype.name, reason, cards.length);
      continue;
    }
    if (trimmed) warnings.add("tags_trimmed");
    countWarnings(warnings);
  }

  for (const { notetype, kind, members } of ioeGroups.values()) {
    const notes = sortIoeNotes(
      members.map((member) => member.note),
      kind,
    );
    const cardsOf = new Map(members.map((member) => [member.note.id, member.cards]));
    const warnings = new Set<ImportWarningCode>();
    const prepared = prepareIoeGroup(notes, kind, {
      fieldNames: notetype.fields.map((field) => field.name),
      mediaNames,
      svg: Boolean(options.rasterizeSvg),
      masks: collection.occlusionMasks ?? {},
      md: markdownFor(warnings),
    });
    for (const code of prepared.warnings) warnings.add(code);
    let draft: Draft | null = null;
    if (prepared.ok) {
      const cards = notes.map((note, index) => ({ ...cardsOf.get(note.id)![0]!, ord: index }));
      const flags = flagTags(cards);
      if (flags.length > 0) warnings.add("flags_as_tags");
      const { tags, trimmed } = convertTags([...notes.flatMap((note) => note.tags), ...flags]);
      if (trimmed) warnings.add("tags_trimmed");
      const candidate = { content: prepared.content, cards, key: notes[0]!.id, templateOrd: null };
      draft = finishFlashcard(candidate, tags, collection, options, reviewsByCard, warnings);
      if (draft && prepared.ok) {
        draft.source = {
          noteId: notes[0]!.id,
          notetypeId: notetype.id,
          ankiCardIds: cards.map((card) => card.id),
        };
        drafts.push(draft);
      }
    }
    for (const [index, note] of notes.entries()) {
      const cards = cardsOf.get(note.id)!;
      if (draft && prepared.ok) {
        countWarnings(warnings);
        if (prepared.approximated[index]) countWarnings(["occlusion_shape_approximated"]);
        continue;
      }
      const reasons = (["missing_media", "unsupported_image_removed"] as const).filter((code) =>
        warnings.has(code),
      );
      countWarnings(["empty_note_skipped", ...reasons]);
      const reason = prepared.ok ? "empty_content" : prepared.reason;
      omit(note, cards[0]!.deckId, notetype.name, reason, cards.length);
    }
  }

  return buildPlan(collection, decks, drafts, warningCounts, omitted, options);
}

function groupBy<Item>(items: readonly Item[], keyOf: (item: Item) => string) {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

type Candidate = { content: Content; cards: AnkiCard[]; key: string; templateOrd: number | null };

function mappedContent(
  note: AnkiNote,
  mapping: Exclude<NotetypeMapping, { kind: "template" }>,
  ctx: NoteContext,
): Content | null {
  const side = (indexes: number[]) =>
    indexes
      .map((index) => ctx.md(note.fields[index] ?? ""))
      .filter(Boolean)
      .join("\n\n");
  const front = side(mapping.front);
  if (!front) return null;
  if (mapping.kind === "type_answer") {
    const answer = ctx.md(note.fields[mapping.answer] ?? "", true).trim();
    return answer
      ? { type: "type_answer", content: { prompt: front, answer, acceptedAnswers: [] } }
      : null;
  }
  const back = side(mapping.back);
  return back ? { type: mapping.kind, content: { front, back } } : null;
}

function renderCustomNotetypeCards(
  note: AnkiNote,
  notetype: AnkiNotetype,
  mirrored: boolean,
  cards: AnkiCard[],
  decks: Map<string, AnkiDeck>,
  ctx: NoteContext,
) {
  const fields = new Map(notetype.fields.map((field, i) => [field.name, note.fields[i] ?? ""]));
  const fieldValues = [...fields.values()];
  const md = (html: string, plain = false) => ctx.md(html, plain, fieldValues);
  const candidates: Candidate[] = [];
  for (const card of cards) {
    const template =
      notetype.templates.find((t) => t.ord === card.ord) ?? notetype.templates[card.ord];
    if (!template) continue;
    const deckName = decks.get(card.deckId)?.name ?? "Default";
    const rendered = renderCard(notetype, template, {
      fields,
      deck: deckName,
      subdeck: deckName.split("::").pop() ?? deckName,
      clozeNum: card.ord + 1,
      fieldIsUsable: (html) => Boolean(md(html).trim()),
    });
    if (!rendered) continue;
    if (rendered.tts) ctx.warnings.add("tts_removed");
    if ("unusableFront" in rendered) {
      ctx.warnings.add("required_content_card_skipped");
      continue;
    }
    const front = md(rendered.front);
    if (!front) continue;
    const base = { cards: [card], key: `${note.id}:${card.ord}`, templateOrd: card.ord };
    const typeField = templateRefs(template.qfmt).typeField;
    if (typeField) {
      const answer = md(fields.get(typeField) ?? "", true).trim();
      if (answer) {
        const content = { prompt: front, answer, acceptedAnswers: [] };
        candidates.push({ ...base, content: { type: "type_answer", content } });
      }
      continue;
    }
    const back = rendered.answerRule
      ? md(rendered.back)
      : stripRepeatedFront(front, md(rendered.back));
    if (back) candidates.push({ ...base, content: { type: "basic", content: { front, back } } });
  }

  if (
    mirrored &&
    candidates.length === 2 &&
    candidates[0]!.templateOrd !== candidates[1]!.templateOrd &&
    candidates.every((candidate) => candidate.content.type === "basic")
  ) {
    const [forward, reverse] = candidates.sort((a, b) => a.templateOrd! - b.templateOrd!);
    return [
      {
        content: { type: "basic_reversed" as const, content: forward!.content.content },
        cards: [...forward!.cards, ...reverse!.cards],
        key: note.id,
        templateOrd: forward!.templateOrd,
      },
    ];
  }
  return candidates;
}

function omissionReason(warnings: Set<ImportWarningCode>, isCustom: boolean): ImportOmittedReason {
  if (warnings.has("missing_media")) return "missing_image";
  if (warnings.has("unsupported_image_removed")) return "unsupported_image";
  if (warnings.has("required_content_card_skipped") || isCustom) return "unusable_template";
  return "empty_content";
}

function finishFlashcard(
  candidate: Candidate,
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
  if (specs.length === 0 || specs.length > MAX_REVIEW_UNITS_PER_FLASHCARD) return null;

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
    const buried = card.queue === -2 || card.queue === -3;
    return { subKey: spec.subKey, schedule, logs, ...(buried ? { buried } : {}) };
  });
  const positions = candidate.cards.filter((card) => card.type === 0).map((card) => card.due);

  return {
    key: candidate.key,
    deckKey: candidate.cards[0].deckId,
    type,
    content,
    tags,
    archived: candidate.cards.every((card) => card.queue === -1),
    units,
    media: mediaIn(content),
    newPosition: positions.length > 0 ? Math.min(...positions) : null,
  };
}

type DraftGroup = {
  drafts: Draft[];
  reviewUnits: number;
  due: number;
  newPosition: number;
};

const unitCount = (drafts: readonly Draft[]) =>
  drafts.reduce((total, draft) => total + draft.units.length, 0);

function packNotes(drafts: readonly Draft[], cardCap: number, unitCap: number) {
  const groups = new Map<string, DraftGroup>();
  for (const draft of drafts) {
    const noteId = draft.source?.noteId ?? draft.key;
    let group = groups.get(noteId);
    if (!group) {
      group = { drafts: [], reviewUnits: 0, due: Infinity, newPosition: Infinity };
      groups.set(noteId, group);
    }
    group.drafts.push(draft);
    group.reviewUnits += draft.units.length;
    for (const unit of draft.units)
      if (unit.schedule) group.due = Math.min(group.due, unit.schedule.due);
    if (draft.newPosition != null)
      group.newPosition = Math.min(group.newPosition, draft.newPosition);
  }
  const compare = (x: number, y: number) => (x < y ? -1 : x > y ? 1 : 0);
  const ordered = [...groups.values()].sort(
    (a, b) => compare(a.due, b.due) || compare(a.newPosition, b.newPosition),
  );
  const parts: Draft[][] = [];
  let current: Draft[] = [];
  let units = 0;
  for (const group of ordered) {
    if (
      current.length > 0 &&
      (current.length + group.drafts.length > cardCap || units + group.reviewUnits > unitCap)
    ) {
      parts.push(current);
      current = [];
      units = 0;
    }
    current.push(...group.drafts);
    units += group.reviewUnits;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

function limitDrafts(drafts: Draft[], limit: NonNullable<ImportOptions["limit"]>) {
  const first = packNotes(drafts, limit.flashcards, limit.reviewUnits)[0] ?? [];
  const fits = first.length <= limit.flashcards && unitCount(first) <= limit.reviewUnits;
  return fits ? first : [];
}

function trimReviewLogs(drafts: Draft[], max: number) {
  const logs = drafts.flatMap((draft) => draft.units.flatMap((unit) => unit.logs));
  if (logs.length <= max) return 0;
  const keep = new Set(logs.sort((a, b) => b.review - a.review).slice(0, max));
  for (const draft of drafts)
    for (const unit of draft.units) unit.logs = unit.logs.filter((log) => keep.has(log));
  return logs.length - max;
}

function buildPlan(
  collection: AnkiCollection,
  decks: Map<string, AnkiDeck>,
  allDrafts: Draft[],
  warningCounts: Map<ImportWarningCode, number>,
  omitted: ImportOmitted[],
  options: ImportOptions,
): ImportPlan {
  const drafts = options.limit ? limitDrafts(allDrafts, options.limit) : allDrafts;
  const reviewLogsDropped = trimReviewLogs(drafts, MAX_IMPORT_REVIEW_LOGS);
  const draftsByDeck = groupBy(drafts, (draft) => draft.deckKey);

  const configs = new Map((collection.deckConfigs ?? []).map((config) => [config.id, config]));
  const importDecks: ImportDeck[] = [];
  const seen = new Set<string>();
  const add = (id: string, ankiName: string) => {
    const deckDrafts = draftsByDeck.get(id) ?? [];
    if (deckDrafts.length === 0 || seen.has(id)) return;
    seen.add(id);
    const configId = decks.get(id)?.configId;
    const config = configId ? configs.get(configId) : undefined;
    const settings = config ? deckSettingsFromConfig(config) : undefined;
    const base: ImportDeck = {
      key: id,
      name: armDeckName(ankiName),
      ankiName,
      cardCount: deckDrafts.length,
      ...(settings ? { settings } : {}),
      ...(config && (config.newPerDay !== null || config.reviewsPerDay !== null)
        ? {
            ankiLimits: {
              newPerDay: config.newPerDay,
              reviewsPerDay: config.reviewsPerDay,
              preset: config.name,
            },
          }
        : {}),
    };
    const units = unitCount(deckDrafts);
    if (deckDrafts.length <= MAX_FLASHCARDS_PER_DECK && units <= MAX_REVIEW_UNITS_PER_DECK) {
      importDecks.push(base);
      return;
    }
    const parts = packNotes(deckDrafts, MAX_FLASHCARDS_PER_DECK, MAX_REVIEW_UNITS_PER_DECK);
    const cap = deckDrafts.length > MAX_FLASHCARDS_PER_DECK ? "flashcards" : "reviewUnits";
    parts.forEach((partDrafts, index) => {
      const suffix = ` (${index + 1} of ${parts.length})`;
      const key = `${id}#${index + 1}`;
      for (const draft of partDrafts) draft.deckKey = key;
      importDecks.push({
        ...base,
        key,
        name: `${cut(base.name, MAX_NAME_CHARS - suffix.length).trimEnd()}${suffix}`,
        cardCount: partDrafts.length,
        split: { key: id, parts: parts.length, cards: deckDrafts.length, cap },
      });
    });
  };
  for (const deck of collection.decks) add(deck.id, deck.name);
  for (const id of draftsByDeck.keys()) add(id, decks.get(id)?.name ?? "Default");

  const uniqueNames = uniqueDeckNames(importDecks);
  importDecks.forEach((deck, index) => (deck.name = uniqueNames[index]!));

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
    ...(omitted.length > 0 ? { omitted } : {}),
    ...(options.limit ? { limit: { leftOut: allDrafts.length - drafts.length } } : {}),
    ...(reviewLogsDropped > 0 ? { reviewLogsDropped } : {}),
    totals: {
      flashcards: drafts.length,
      reviewUnits,
      reviewLogs,
      mediaFiles: media.size,
      byType,
    },
  };
}
