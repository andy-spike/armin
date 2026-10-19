/**
 * Flashcard media is content-addressed: a file is named by the SHA-256 of its
 * bytes plus an image extension, and Flashcard content refers to it as
 * `armin-media:<fileName>`. This mirrors the desktop's Profile media format.
 */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const MEDIA_EXTENSIONS = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
} as const;

const MEDIA_FILE_PATTERN = `([a-f0-9]{64})\\.(${Object.keys(MEDIA_EXTENSIONS).join("|")})`;
const MEDIA_FILE_RE = new RegExp(`^${MEDIA_FILE_PATTERN}$`);
const MEDIA_REF_GLOBAL_RE = new RegExp(
  `armin-media:${MEDIA_FILE_PATTERN}`,
  "g",
);

export function isMediaFileName(fileName: string) {
  return MEDIA_FILE_RE.test(fileName);
}

/** The SHA-256 hex digest and content type encoded in a media file name. */
export function parseMediaFileName(fileName: string) {
  const match = MEDIA_FILE_RE.exec(fileName);
  if (!match) return null;
  const ext = match[2] as keyof typeof MEDIA_EXTENSIONS;
  return { sha256: match[1], contentType: MEDIA_EXTENSIONS[ext] };
}

/** Every media file referenced from a piece of Flashcard content. */
export function mediaFileNamesIn(text: string) {
  const names = new Set<string>();
  for (const match of text.matchAll(MEDIA_REF_GLOBAL_RE)) {
    names.add(`${match[1]}.${match[2]}`);
  }
  return [...names];
}
