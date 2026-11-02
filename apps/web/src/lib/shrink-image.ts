import { sniffImageExt } from "@armin/core/media";

/**
 * Images are shrunk in the browser before upload, so the library stores one
 * compact copy and quotas count only that copy.
 *
 * - The longest side is at most 1600 px (sharper than any card, zoom included).
 * - Photos become WebP at quality 80; screenshots and diagrams (few colours)
 *   become lossless WebP so text stays crisp. Browsers that can't make WebP
 *   (some Safari versions) get JPEG 82 for photos and PNG for graphics.
 * - Re-encoding turns photos upright and drops EXIF (camera, GPS) data.
 * - GIF (animation) and SVG are left untouched.
 * - A small file keeps its original bytes unless the new one is at least 10%
 *   smaller, except a JPEG carrying EXIF, which is replaced whenever it shrinks.
 */
const MAX_SIDE = 1600;
const PHOTO_WEBP_QUALITY = 0.8;
const PHOTO_JPEG_QUALITY = 0.82;
const MIN_SAVING = 0.1;
/** More distinct colours than this in the sample means a photo, not a graphic. */
const GRAPHIC_MAX_COLORS = 4096;
const SAMPLE_PIXELS = 250_000;
const SHRINKABLE = new Set(["jpg", "png", "webp", "bmp", "avif"]);

type Canvas = HTMLCanvasElement;

function newCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: Canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/**
 * Draw the bitmap at most MAX_SIDE on its longest side. Large downscales halve
 * step by step, which keeps detail and never allocates a full-size canvas for
 * camera photos (iOS caps canvas area).
 */
function drawScaled(bitmap: ImageBitmap) {
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
  let source: CanvasImageSource = bitmap;
  let width = bitmap.width;
  let height = bitmap.height;
  while (width / 2 >= targetWidth * 1.5) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    const step = newCanvas(width, height);
    context(step).drawImage(source, 0, 0, width, height);
    if (source instanceof HTMLCanvasElement) source.width = 0;
    source = step;
  }
  const canvas = newCanvas(targetWidth, targetHeight);
  context(canvas).drawImage(source, 0, 0, targetWidth, targetHeight);
  if (source instanceof HTMLCanvasElement) source.width = 0;
  return canvas;
}

/** Few distinct colours (screenshots, diagrams, slides) compress best losslessly. */
function inspectPixels(canvas: Canvas) {
  const { data } = context(canvas).getImageData(0, 0, canvas.width, canvas.height);
  const pixels = canvas.width * canvas.height;
  const stride = Math.max(1, Math.floor(pixels / SAMPLE_PIXELS));
  const colors = new Set<number>();
  let alpha = false;
  for (let pixel = 0; pixel < pixels; pixel += stride) {
    const i = pixel * 4;
    if (data[i + 3] < 255) alpha = true;
    if (colors.size <= GRAPHIC_MAX_COLORS)
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return { graphic: colors.size <= GRAPHIC_MAX_COLORS, alpha };
}

function encode(canvas: Canvas, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Candidate encodings, smallest first; a browser that can't make a type returns PNG. */
async function encodings(canvas: Canvas, graphic: boolean, alpha: boolean) {
  const out: Blob[] = [];
  const add = (blob: Blob | null, type: string) => {
    if (blob && blob.type === type) out.push(blob);
  };
  if (graphic) {
    // Chromium writes lossless WebP at quality 1; other browsers write
    // near-lossless lossy WebP, and the PNG candidate covers that case.
    add(await encode(canvas, "image/webp", 1), "image/webp");
    add(await encode(canvas, "image/png"), "image/png");
  } else {
    add(await encode(canvas, "image/webp", PHOTO_WEBP_QUALITY), "image/webp");
    if (out.length === 0)
      add(
        alpha
          ? await encode(canvas, "image/png")
          : await encode(canvas, "image/jpeg", PHOTO_JPEG_QUALITY),
        alpha ? "image/png" : "image/jpeg",
      );
  }
  return out.sort((a, b) => a.size - b.size);
}

/** A JPEG with an APP1 Exif segment carries camera and often location data. */
function jpegHasExif(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) return false; // start of scan: no more metadata
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (
      marker === 0xe1 &&
      String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === "Exif"
    )
      return true;
    offset += 2 + length;
  }
  return false;
}

/**
 * Return a smaller version of an image for upload, or the original when it is
 * already as small as it should be or the browser can't decode it (the server
 * still validates every upload).
 */
export async function shrinkImage(file: Blob): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;
  const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const ext = sniffImageExt(bytes);
  if (!ext || !SHRINKABLE.has(ext)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  let canvas: Canvas | null = null;
  try {
    const oversized = Math.max(bitmap.width, bitmap.height) > MAX_SIDE;
    canvas = drawScaled(bitmap);
    const { graphic, alpha } = inspectPixels(canvas);
    const [best] = await encodings(canvas, graphic, alpha);
    if (!best || best.size >= file.size) return file;
    const exif = ext === "jpg" && jpegHasExif(bytes);
    const worthIt = best.size <= file.size * (1 - MIN_SAVING);
    return oversized || exif || worthIt ? best : file;
  } catch {
    return file;
  } finally {
    bitmap.close();
    if (canvas) canvas.width = 0;
  }
}
