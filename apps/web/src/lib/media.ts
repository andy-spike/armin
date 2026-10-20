import { mediaRefFromFileName, replaceMediaRefs } from "@armin/core/media-ref";

/**
 * Library images render through the app's same-origin `/media/<file>` route,
 * which checks the signed-in session on every request. Stored content keeps
 * the portable `armin-media:<file>` reference.
 */
const MEDIA_PATH_RE =
  /(?:https?:\/\/[^/\s)"']+)?\/media\/([a-f0-9]{64}\.(?:png|jpg|gif|webp|svg|bmp|avif))/g;

export function mediaDisplayUrl(ref: string): string {
  let url = ref;
  replaceMediaRefs(ref, (_ref, fileName) => (url = `/media/${fileName}`));
  return url;
}

export function mediaRefFromDisplayUrl(url: string): string | null {
  const match = new RegExp(MEDIA_PATH_RE.source).exec(url);
  return match ? mediaRefFromFileName(match[1]) : null;
}

export function resolveMediaRefsInMarkdown(markdown: string): string {
  return replaceMediaRefs(markdown, (_ref, fileName) => `/media/${fileName}`);
}

export function persistMediaRefsInMarkdown(markdown: string): string {
  return markdown.replace(MEDIA_PATH_RE, (_url, fileName: string) =>
    mediaRefFromFileName(fileName),
  );
}
