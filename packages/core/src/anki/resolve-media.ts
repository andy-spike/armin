import type { FlashcardContent, FlashcardType } from "../flashcard-types";
import { ANKI_MEDIA_PREFIX } from "./types";

const MARKDOWN_PLACEHOLDER_RE = /!\[[^\]]*\]\(anki-media:([^)\s]+)\)/g;

function decodeName(encoded: string) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/** Tidy the gaps left where a missing image was removed. */
function tidy(text: string) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveMarkdown(text: string, media: ReadonlyMap<string, string>, required = false) {
  let removed = false;
  const out = text.replace(MARKDOWN_PLACEHOLDER_RE, (_, encoded: string) => {
    const ref = media.get(decodeName(encoded));
    if (ref) return `![](${ref})`;
    removed = true;
    return "";
  });
  // A required field may contain static labels around its image. Keeping
  // those labels cannot establish that the question or answer still works.
  if (removed && required) throw new Error("A required image could not be imported.");
  return removed ? tidy(out) : out;
}

/**
 * Swap the `anki-media:` placeholders in converted content for the Armin media
 * references the client got back from uploading (`media` maps the Anki file name
 * to its `armin-media:` reference). A placeholder with no entry is dropped
 * from optional answer extras. Missing images in question/answer fields reject
 * the card rather than retaining an unanswerable static prompt. A missing
 * occlusion base becomes empty so `validateContent` rejects that card too.
 */
export function resolveImportMedia(
  content: FlashcardContent,
  type: FlashcardType,
  media: ReadonlyMap<string, string>,
) {
  const mapField = (value: string) => resolveMarkdown(value, media);
  const requiredField = (value: string) => resolveMarkdown(value, media, true);
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as { front: string; back: string };
      return {
        ...c,
        front: requiredField(c.front),
        back: requiredField(c.back),
      } as FlashcardContent;
    }
    case "cloze": {
      const c = content as { text: string; extra?: string };
      const { extra, ...rest } = c;
      const mappedExtra = extra === undefined ? undefined : mapField(extra);
      return {
        ...rest,
        text: requiredField(c.text),
        ...(mappedExtra ? { extra: mappedExtra } : {}),
      } as FlashcardContent;
    }
    case "type_answer": {
      const c = content as { prompt: string; answer: string; acceptedAnswers: string[] };
      return { ...c, prompt: requiredField(c.prompt) } as FlashcardContent;
    }
    case "image_occlusion": {
      const c = content as { baseImage: string; header?: string; extra?: string };
      const base = c.baseImage.startsWith(ANKI_MEDIA_PREFIX)
        ? (media.get(decodeName(c.baseImage.slice(ANKI_MEDIA_PREFIX.length))) ?? "")
        : c.baseImage;
      return {
        ...c,
        baseImage: base,
        ...(c.header === undefined ? {} : { header: mapField(c.header) }),
        ...(c.extra === undefined ? {} : { extra: mapField(c.extra) }),
      } as FlashcardContent;
    }
  }
}
