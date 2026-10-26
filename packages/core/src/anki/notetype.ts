import { hasOcclusionMarkers } from "./occlusion";
import type { AnkiNote, AnkiNotetype } from "./types";

/**
 * How an Anki notetype maps onto an Armin flashcard type. Anki lets users
 * rename and translate notetypes, fields, and templates, so detection reads the
 * stock kind when the package records one and otherwise compares template
 * structure, with field names turned into positions.
 */
export type NotetypeKind =
  | { kind: "basic"; front: number; back: number }
  | { kind: "basic_reversed"; front: number; back: number }
  | { kind: "optional_reversed"; front: number; back: number; reverse: number }
  | { kind: "type_answer"; front: number; answer: number }
  | { kind: "cloze"; text: number; extra: number | null }
  | {
      kind: "image_occlusion";
      occlusion: number;
      image: number;
      header: number | null;
      extra: number | null;
    }
  | { kind: "custom" };

/** Replace field references with `f<i>` so the template shape is name-independent. */
function shape(fmt: string, fieldNames: string[]) {
  return fmt
    .replace(/<hr\s+id\s*=\s*["']?answer["']?\s*\/?>/gi, "<hr>")
    .replace(/\{\{([^{}]*)\}\}/g, (whole, body: string) => {
      const trimmed = body.trim();
      if (trimmed === "FrontSide") return "{{FS}}";
      const prefix = /^[#^/]/.test(trimmed) ? trimmed[0] : "";
      const parts = trimmed.slice(prefix.length).split(":");
      const index = fieldNames.indexOf(parts[parts.length - 1].trim());
      if (index === -1) return whole;
      parts[parts.length - 1] = `f${index}`;
      return `{{${prefix}${parts.join(":")}}}`;
    })
    .replace(/\s+/g, "");
}

function byName(notetype: AnkiNotetype, pattern: RegExp) {
  const index = notetype.fields.findIndex((field) => pattern.test(field.name));
  return index === -1 ? null : index;
}

function structuralKind(notetype: AnkiNotetype): NotetypeKind {
  const names = notetype.fields.map((field) => field.name);
  const templates = notetype.templates.map((template) => ({
    q: shape(template.qfmt, names),
    a: shape(template.afmt, names),
  }));
  const fieldCount = names.length;

  if (templates.length === 1 && fieldCount >= 2) {
    const [t] = templates;
    if (t.q === "{{f0}}" && t.a === "{{FS}}<hr>{{f1}}") return { kind: "basic", front: 0, back: 1 };
    // Typing notetypes ask for the typed field on the front: `{{f0}}{{type:f1}}`.
    const typed = /^\{\{f0\}\}\{\{type:f(\d+)\}\}$/.exec(t.q);
    if (typed && Number(typed[1]) < fieldCount) {
      return { kind: "type_answer", front: 0, answer: Number(typed[1]) };
    }
  }
  if (templates.length === 2 && fieldCount >= 2) {
    const [forward, reverse] = templates;
    const forwardIsBasic = forward.q === "{{f0}}" && forward.a === "{{FS}}<hr>{{f1}}";
    if (forwardIsBasic && reverse.q === "{{f1}}" && reverse.a === "{{FS}}<hr>{{f0}}") {
      return { kind: "basic_reversed", front: 0, back: 1 };
    }
    if (forwardIsBasic && fieldCount >= 3 && reverse.q === "{{#f2}}{{f1}}{{/f2}}") {
      return { kind: "optional_reversed", front: 0, back: 1, reverse: 2 };
    }
  }
  return { kind: "custom" };
}

/** Highest field position any template of the notetype refers to. */
function highestFieldUsed(notetype: AnkiNotetype) {
  const names = notetype.fields.map((field) => field.name);
  const used = notetype.templates.flatMap((template) =>
    [...shape(template.qfmt + template.afmt, names).matchAll(/f(\d+)\}\}/g)].map((m) =>
      Number(m[1]),
    ),
  );
  return Math.max(-1, ...used);
}

/** Does the notetype still look like the stock one it was created from? */
function stockMatchesShape(notetype: AnkiNotetype, stockKind: number) {
  const fields = notetype.fields.length;
  const templates = notetype.templates.length;
  switch (stockKind) {
    case 1:
    case 4:
      return templates === 1 && fields >= 2 && highestFieldUsed(notetype) <= 1;
    case 2:
      return templates === 2 && fields >= 2 && highestFieldUsed(notetype) <= 1;
    case 3:
      return templates === 2 && fields >= 3 && highestFieldUsed(notetype) <= 2;
    default:
      return false;
  }
}

function clozeKind(notetype: AnkiNotetype, notes: AnkiNote[]): NotetypeKind {
  const names = notetype.fields.map((field) => field.name);
  const occlusion = notetype.fields.findIndex((_, index) =>
    notes.some((note) => hasOcclusionMarkers(note.fields[index] ?? "")),
  );
  const looksLikeOcclusion =
    notetype.stockKind === 6 ||
    (occlusion !== -1 && notetype.fields.length >= 2) ||
    (byName(notetype, /occlusion/i) !== null && byName(notetype, /image/i) !== null);
  if (looksLikeOcclusion) {
    const occlusionIndex = occlusion !== -1 ? occlusion : (byName(notetype, /occlusion/i) ?? 0);
    const imageIndex = byName(notetype, /^image$/i) ?? (occlusionIndex === 0 ? 1 : 0);
    const rest = names.map((_, i) => i).filter((i) => i !== occlusionIndex && i !== imageIndex);
    return {
      kind: "image_occlusion",
      occlusion: occlusionIndex,
      image: imageIndex,
      header: byName(notetype, /^header$/i) ?? rest[0] ?? null,
      extra: byName(notetype, /^back extra$/i) ?? rest[1] ?? null,
    };
  }
  // The text field is the one the template wraps in `{{cloze:…}}`.
  const referenced = /\{\{cloze:([^{}]+)\}\}/.exec(notetype.templates[0]?.qfmt ?? "")?.[1]?.trim();
  const textIndex = Math.max(0, referenced ? names.indexOf(referenced) : 0);
  const extra =
    byName(notetype, /^(back extra|extra)$/i) ??
    names.map((_, i) => i).find((i) => i !== textIndex) ??
    null;
  return { kind: "cloze", text: textIndex, extra };
}

export function classifyNotetype(notetype: AnkiNotetype, notes: AnkiNote[]): NotetypeKind {
  if (notetype.kind === "cloze") return clozeKind(notetype, notes);

  const structural = structuralKind(notetype);
  const stock = notetype.stockKind;
  // A recorded stock kind wins as long as the notetype still has that shape.
  if (stock !== null && stockMatchesShape(notetype, stock)) {
    if (stock === 1) return { kind: "basic", front: 0, back: 1 };
    if (stock === 2) return { kind: "basic_reversed", front: 0, back: 1 };
    if (stock === 3) return { kind: "optional_reversed", front: 0, back: 1, reverse: 2 };
    if (stock === 4) {
      return structural.kind === "type_answer"
        ? structural
        : { kind: "type_answer", front: 0, answer: 1 };
    }
  }
  return structural;
}
