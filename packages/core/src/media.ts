import type {
  ConceptContent,
  FlashcardContent,
  FlashcardType,
  ImageOcclusionContent,
} from "./flashcard-types";
import { isMediaRef, parseMediaRef } from "./media-ref";

export type ImageExt = "png" | "jpg" | "gif" | "webp" | "svg" | "bmp" | "avif";

export type AudioExt = "mp3" | "ogg" | "m4a" | "wav" | "flac" | "aac";
export type MediaExt = ImageExt | AudioExt;

export const IMAGE_MIME_BY_EXT: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

export const AUDIO_MIME_BY_EXT: Record<AudioExt, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
};

export const MIME_BY_EXT: Record<MediaExt, string> = { ...IMAGE_MIME_BY_EXT, ...AUDIO_MIME_BY_EXT };

const AUDIO_EXTS = new Set<string>(Object.keys(AUDIO_MIME_BY_EXT));

export function isAudioFile(fileNameOrExt: string) {
  return AUDIO_EXTS.has(fileNameOrExt.slice(fileNameOrExt.lastIndexOf(".") + 1).toLowerCase());
}

export const UNSUPPORTED_MEDIA_MESSAGE =
  "Use a PNG, JPG, GIF, WebP, BMP, or AVIF image, or an MP3, OGG, M4A, WAV, FLAC, or AAC audio file.";

export const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024;

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
  return null;
}

export function sniffAudioExt(bytes: Uint8Array): AudioExt | null {
  if (ascii(bytes, 0, 3) === "ID3") return "mp3";
  if (ascii(bytes, 0, 4) === "OggS") return "ogg";
  if (ascii(bytes, 0, 4) === "fLaC") return "flac";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "wav";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (/^(?:M4A |M4B |mp4\d|isom|iso\d|dash|MSNV)$/.test(brand)) return "m4a";
    return null;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return (bytes[1] & 0x06) === 0 ? "aac" : "mp3";
  }
  return null;
}

export function sniffMediaExt(bytes: Uint8Array): MediaExt | null {
  return sniffImageExt(bytes) ?? sniffAudioExt(bytes);
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
const HTML_IMAGE_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

export function markdownFieldsFor(type: FlashcardType, content: FlashcardContent): string[] {
  switch (type) {
    case "basic":
    case "basic_reversed": {
      const c = content as { front: string; back: string };
      return [c.front, c.back];
    }
    case "cloze": {
      const c = content as { text: string; extra?: string };
      return [c.text, c.extra].filter((v): v is string => Boolean(v));
    }
    case "type_answer":
      return [(content as { prompt: string }).prompt];
    case "image_occlusion": {
      const c = content as ImageOcclusionContent;
      return [c.header, c.extra].filter((v): v is string => Boolean(v));
    }
    case "concept": {
      const c = content as ConceptContent;
      return [c.brief, c.example.exercise, c.example.solution];
    }
  }
}

export function contentMediaFileNames(type: FlashcardType, content: FlashcardContent): string[] {
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

export function svgRasterSize(intrinsicWidth: number, intrinsicHeight: number) {
  const sourceWidth = intrinsicWidth > 0 && intrinsicHeight > 0 ? intrinsicWidth : 512;
  const sourceHeight = intrinsicWidth > 0 && intrinsicHeight > 0 ? intrinsicHeight : 512;
  const scale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight));
  return {
    sourceWidth,
    sourceHeight,
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}
