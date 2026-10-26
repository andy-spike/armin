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

function resolveMarkdown(text: string, media: ReadonlyMap<string, string>) {
  let removed = false;
  const out = text.replace(MARKDOWN_PLACEHOLDER_RE, (_, encoded: string) => {
    const ref = media.get(decodeName(encoded));
    if (ref) return `![](${ref})`;
    removed = true;
    return "";
  });
  return removed ? tidy(out) : out;
}

/**
 * Swap the `anki-media:` placeholders in converted content for the Armin media
 * references the client got back from uploading (`media` maps the Anki file name
 * to its `armin-media:` reference). A placeholder with no entry is dropped
 * cleanly: its Markdown image disappears, and a missing occlusion base image
 * becomes an empty string so `validateContent` rejects the card.
 */
export function resolveImportMedia(
  content: FlashcardContent,
  type: FlashcardType,
  media: ReadonlyMap<string, string>,
) {
  const mapField = (value: string) => resolveMarkdown(value, media);
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as { front: string; back: string };
      return { ...c, front: mapField(c.front), back: mapField(c.back) } as FlashcardContent;
    }
    case "cloze": {
      const c = content as { text: string; extra?: string };
      const { extra, ...rest } = c;
      const mappedExtra = extra === undefined ? undefined : mapField(extra);
      return {
        ...rest,
        text: mapField(c.text),
        ...(mappedExtra ? { extra: mappedExtra } : {}),
      } as FlashcardContent;
    }
    case "type_answer": {
      const c = content as { prompt: string; answer: string; acceptedAnswers: string[] };
      return { ...c, prompt: mapField(c.prompt) } as FlashcardContent;
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
