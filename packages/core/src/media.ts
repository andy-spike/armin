/**
 * Portable Flashcard media rules: supported image kinds, magic-byte sniffing,
 * and extracting the `armin-media:` references a flashcard's content uses.
 * Free of Node `Buffer` so it runs in Convex and React Native.
 */

import type {
  FlashcardContent,
  FlashcardType,
  ImageOcclusionContent,
} from "./flashcard-types";
import { isMediaRef, parseMediaRef } from "./media-ref";

export type ImageExt = "png" | "jpg" | "gif" | "webp" | "svg" | "bmp" | "avif";

export const MIME_BY_EXT: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

/** Beta media limits. Adjust together with the backend quota copy. */
export const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024;
// Every library's images must fit one export download (an HTTP response of at
// most 100 MiB), alongside its structured data.
export const MAX_LIBRARY_MEDIA_BYTES = 80 * 1024 * 1024;

function ascii(bytes: Uint8Array, start: number, length: number) {
  let out = "";
  for (let i = start; i < Math.min(bytes.length, start + length); i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function startsWith(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

/** Detect the actual image type from file bytes; null when unsupported. */
export function sniffImageExt(bytes: Uint8Array): ImageExt | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  const six = ascii(bytes, 0, 6);
  if (six === "GIF87a" || six === "GIF89a") return "gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  if (startsWith(bytes, [0x42, 0x4d])) return "bmp";
  if (ascii(bytes, 4, 4) === "ftyp" && ascii(bytes, 8, 4).startsWith("avif")) {
    return "avif";
  }
  // SVG is not accepted for uploads: it can carry script and is served from
  // an authenticated route. Existing desktop exports may still contain it.
  return null;
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
const HTML_IMAGE_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

/** The Markdown-bearing fields of a flashcard's content. */
export function markdownFieldsFor(
  type: FlashcardType,
  content: FlashcardContent,
): string[] {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as { front: string; back: string };
      return [c.front, c.back];
    }
    case "cloze":
      return [(content as { text: string }).text];
    case "type_answer":
      return [(content as { prompt: string }).prompt];
    case "image_occlusion": {
      const c = content as ImageOcclusionContent;
      return [c.header, c.extra].filter((v): v is string => Boolean(v));
    }
  }
}

/**
 * Every media file name referenced by the content. Throws when an image
 * source is not an `armin-media:` reference (inline data or remote URLs).
 */
export function contentMediaFileNames(
  type: FlashcardType,
  content: FlashcardContent,
): string[] {
  const names = new Set<string>();
  const accept = (value: string, label: string) => {
    const fileName = parseMediaRef(value);
    if (!fileName) {
      if (/^data:image\//i.test(value)) {
        throw new Error(`${label} must be uploaded before saving.`);
      }
      throw new Error(`${label} must use uploaded Armin images.`);
    }
    names.add(fileName);
  };
  for (const field of markdownFieldsFor(type, content)) {
    for (const match of field.matchAll(MARKDOWN_IMAGE_RE)) {
      accept(match[1], "Markdown images");
    }
    for (const match of field.matchAll(HTML_IMAGE_SRC_RE)) {
      accept(match[1], "Markdown images");
    }
  }
  if (type === "image_occlusion") {
    accept((content as ImageOcclusionContent).baseImage, "Image occlusion base image");
  }
  return [...names];
}

export { isMediaRef };
