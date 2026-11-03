import { MAX_MEDIA_FILE_BYTES } from "@armin/core/media";

/**
 * Read and discard a request body. Rejecting an oversized upload before the
 * client has finished sending closes the connection mid-write, which HTTP
 * proxies surface as an EPIPE and a 500. Draining lets the caller receive the
 * intended 413 instead.
 */
async function drainBody(body: ReadableStream<Uint8Array> | null) {
  if (!body) return;
  const reader = body.getReader();
  try {
    for (;;) if ((await reader.read()).done) return;
  } catch {
    // The client stopped sending; the response status still explains why.
  }
}

/**
 * An upload's bytes, at most `MAX_MEDIA_FILE_BYTES`. An oversized body is
 * still read to the end, so the caller can answer 413 rather than drop the
 * connection.
 */
export async function readUploadBody(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_MEDIA_FILE_BYTES) {
    await drainBody(request.body);
    return { error: "tooLarge" as const };
  }
  const reader = request.body?.getReader();
  if (!reader) return { error: "empty" as const };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let tooLarge = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (tooLarge) continue;
    size += value.byteLength;
    if (size > MAX_MEDIA_FILE_BYTES) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(value);
  }
  if (tooLarge) return { error: "tooLarge" as const };
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes };
}

/** The content-addressed file name for media bytes: their SHA-256, then the extension. */
export async function mediaFileName(bytes: Uint8Array<ArrayBuffer>, ext: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${sha}.${ext}`;
}
