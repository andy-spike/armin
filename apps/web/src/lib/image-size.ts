const WIDTH_TOKEN_RE = /(?:^|\s)w=(\d+)(?=\s|$)/i;

export function parseImageWidth(title: string | null | undefined): number | null {
  if (!title) return null;
  const match = WIDTH_TOKEN_RE.exec(title);
  if (!match) return null;
  const width = Number.parseInt(match[1], 10);
  return Number.isFinite(width) && width > 0 ? width : null;
}

export function stripImageWidth(title: string | null | undefined): string | undefined {
  if (!title) return undefined;
  const caption = title.replace(WIDTH_TOKEN_RE, " ").replace(/\s+/g, " ").trim();
  return caption.length > 0 ? caption : undefined;
}

export function formatImageTitle(
  width: number | null | undefined,
  caption: string | null | undefined,
): string | undefined {
  const rounded = width == null ? 0 : Math.round(width);
  const widthToken = rounded > 0 ? `w=${rounded}` : "";
  const text = caption?.trim() ?? "";
  const combined = [widthToken, text].filter(Boolean).join(" ");
  return combined.length > 0 ? combined : undefined;
}
