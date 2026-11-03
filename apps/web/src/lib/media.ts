import { MEDIA_EXT_PATTERN, mediaRefFromFileName, replaceMediaRefs } from "@armin/core/media-ref";

/**
 * Library images render through the app's same-origin `/media/<file>` route,
 * which checks the signed-in session on every request. Stored content keeps
 * the portable `armin-media:<file>` reference.
 */
const MEDIA_PATH_RE = new RegExp(
  `(?:https?://[^/\\s)"']+)?/media/([a-f0-9]{64}\\.(?:${MEDIA_EXT_PATTERN}))`,
  "g",
);

export function mediaDisplayUrl(ref: string): string {
  let url = ref;
  replaceMediaRefs(ref, (_ref, fileName) => (url = `/media/${fileName}`));
  return url;
}

export function resolveMediaRefsInMarkdown(markdown: string): string {
  return replaceMediaRefs(markdown, (_ref, fileName) => `/media/${fileName}`);
}

export function persistMediaRefsInMarkdown(markdown: string): string {
  return markdown.replace(MEDIA_PATH_RE, (_url, fileName: string) =>
    mediaRefFromFileName(fileName),
  );
}
