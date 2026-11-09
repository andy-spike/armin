import { CONCEPT_SUBKEY } from "./concept";
import { splitMath } from "./math";
import type {
  BasicContent,
  ClozeContent,
  ConceptContent,
  FlashcardContent,
  FlashcardType,
  ImageOcclusionContent,
  TypeAnswerContent,
} from "./flashcard-types";

function clozeMatches(text: string) {
  const matches: { start: number; end: number; body: string }[] = [];
  let offset = 0;
  const mathRanges = splitMath(text).flatMap((part) => {
    const start = offset;
    offset += part.raw.length;
    return part.kind === "math" ? [{ start, end: offset }] : [];
  });
  for (let i = 0; i < text.length; i++) {
    if (!text.startsWith("{{", i)) continue;
    const inMath = mathRanges.some((range) => i >= range.start && i < range.end);
    if (inMath && !/^\{\{\d+::/.test(text.slice(i))) continue;
    let depth = 0;
    for (let end = i + 2; end < text.length; end++) {
      if (text[end] === "\\") {
        end++;
        continue;
      }
      if (depth === 0 && text.startsWith("}}", end)) {
        matches.push({ start: i, end: end + 2, body: text.slice(i + 2, end) });
        i = end + 1;
        break;
      }
      if (text[end] === "{") depth++;
      else if (text[end] === "}" && depth > 0) depth--;
    }
  }
  return matches;
}

function mapClozeMatches(text: string, replace: (body: string) => string) {
  let result = "";
  let start = 0;
  for (const match of clozeMatches(text)) {
    result += text.slice(start, match.start) + replace(match.body);
    start = match.end;
  }
  return result + text.slice(start);
}

export type ClozeDeletion = {
  cluster: number;
  answer: string;
  hint?: string;
};

type RawCloze = {
  explicitCluster: number | null;
  answer: string;
  hint?: string;
};

function parseClozeBody(body: string): RawCloze {
  const sep = body.indexOf("::");
  if (sep === -1) {
    return { explicitCluster: null, answer: body };
  }
  const head = body.slice(0, sep);
  const rest = body.slice(sep + 2);
  if (/^\d+$/.test(head)) {
    const cluster = Number(head);
    const hintSep = rest.indexOf("::");
    if (hintSep === -1) {
      return { explicitCluster: cluster, answer: rest };
    }
    return {
      explicitCluster: cluster,
      answer: rest.slice(0, hintSep),
      hint: rest.slice(hintSep + 2) || undefined,
    };
  }
  return { explicitCluster: null, answer: head, hint: rest || undefined };
}

export function parseClozes(text: string): ClozeDeletion[] {
  const raws = clozeMatches(text).map((match) => parseClozeBody(match.body));
  const maxExplicitCluster = raws.reduce(
    (maxCluster, rawCloze) =>
      rawCloze.explicitCluster != null && rawCloze.explicitCluster > maxCluster
        ? rawCloze.explicitCluster
        : maxCluster,
    0,
  );
  let nextAutoCluster = maxExplicitCluster + 1;
  return raws.map((rawCloze) => ({
    cluster: rawCloze.explicitCluster ?? nextAutoCluster++,
    answer: rawCloze.answer,
    hint: rawCloze.hint,
  }));
}

export function clozeClusters(text: string): number[] {
  const clusters = new Set(parseClozes(text).map((deletion) => deletion.cluster));
  return [...clusters].sort((a, b) => a - b);
}

export function hasEmptyClozeDeletion(text: string): boolean {
  return parseClozes(text).some((deletion) => deletion.answer.trim().length === 0);
}

function formatClozeDeletion(deletion: ClozeDeletion) {
  return deletion.hint
    ? `{{${deletion.cluster}::${deletion.answer}::${deletion.hint}}}`
    : `{{${deletion.cluster}::${deletion.answer}}}`;
}

export function normalizeClozeText(text: string): string {
  const deletions = parseClozes(text);
  let i = 0;
  return mapClozeMatches(text, () => formatClozeDeletion(deletions[i++]));
}

function clozeBlank(hint?: string): string {
  return hint ? `[${hint}]` : "[…]";
}

function replaceClozes(text: string, fn: (deletion: ClozeDeletion) => string): string {
  const deletions = parseClozes(text);
  let deletionIndex = 0;
  return mapClozeMatches(text, () => fn(deletions[deletionIndex++]));
}

export function renderClozeText(text: string, blankCluster: number | null): string {
  return replaceClozes(text, (d) =>
    blankCluster != null && d.cluster === blankCluster ? clozeBlank(d.hint) : d.answer,
  );
}

function renderClozeBack(cloze: ClozeContent): string {
  const revealed = renderClozeText(cloze.text, null);
  return cloze.extra ? `${revealed}\n\n${cloze.extra}` : revealed;
}

function renderAllClozesBlanked(text: string): string {
  return replaceClozes(text, (d) => clozeBlank(d.hint));
}

export type ReviewUnitSpec = {
  subKey: string;
  front: string;
  back: string;
};

export function generateReviewUnits(
  type: FlashcardType,
  content: FlashcardContent,
): ReviewUnitSpec[] {
  switch (type) {
    case "basic": {
      const basic = content as BasicContent;
      return [{ subKey: "", front: basic.front, back: basic.back }];
    }
    case "basic_reversed": {
      const basic = content as BasicContent;
      return [
        { subKey: "", front: basic.front, back: basic.back },
        { subKey: "rev", front: basic.back, back: basic.front },
      ];
    }
    case "cloze": {
      const cloze = content as ClozeContent;
      return clozeClusters(cloze.text).map((cluster) => ({
        subKey: `c${cluster}`,
        front: renderClozeText(cloze.text, cluster),
        back: renderClozeBack(cloze),
      }));
    }
    case "type_answer": {
      const typeAnswer = content as TypeAnswerContent;
      return [{ subKey: "", front: typeAnswer.prompt, back: typeAnswer.answer }];
    }
    case "image_occlusion": {
      const imageOcclusion = content as ImageOcclusionContent;
      return imageOcclusion.masks.map((mask) => ({
        subKey: mask.id,
        front:
          [imageOcclusion.header, mask.hint ? `Hint: ${mask.hint}` : null]
            .filter(Boolean)
            .join("\n\n") || "Recall the hidden area.",
        back: mask.label ?? "Hidden area",
      }));
    }
    case "concept":
      return [{ subKey: CONCEPT_SUBKEY, front: "", back: "" }];
  }
}

export function flashcardDisplay(
  type: FlashcardType,
  content: FlashcardContent,
): { front: string; back: string } {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const basic = content as BasicContent;
      return { front: basic.front, back: basic.back };
    }
    case "cloze": {
      const cloze = content as ClozeContent;
      return {
        front: renderAllClozesBlanked(cloze.text),
        back: renderClozeBack(cloze),
      };
    }
    case "type_answer": {
      const typeAnswer = content as TypeAnswerContent;
      return { front: typeAnswer.prompt, back: typeAnswer.answer };
    }
    case "image_occlusion": {
      const imageOcclusion = content as ImageOcclusionContent;
      const count = imageOcclusion.masks.length;
      return {
        front: `Image occlusion · ${count} mask${count === 1 ? "" : "s"}`,
        back: imageOcclusion.masks
          .map((mask) => mask.label)
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "concept": {
      const concept = content as ConceptContent;
      return { front: concept.brief, back: concept.example.exercise };
    }
  }
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function matchesTypeAnswer(input: string, content: TypeAnswerContent): boolean {
  const normalized = normalizeAnswer(input);
  if (!normalized) return false;
  const candidates = [content.answer, ...content.acceptedAnswers];
  return candidates.some((candidate) => normalizeAnswer(candidate) === normalized);
}
