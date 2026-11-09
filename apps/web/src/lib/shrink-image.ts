import { sniffImageExt } from "@armin/core/media";

const MAX_SIDE = 1600;
const PHOTO_WEBP_QUALITY = 0.8;
const PHOTO_JPEG_QUALITY = 0.82;
const MIN_SAVING = 0.1;
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

async function encodings(canvas: Canvas, graphic: boolean, alpha: boolean) {
  const out: Blob[] = [];
  const add = (blob: Blob | null, type: string) => {
    if (blob && blob.type === type) out.push(blob);
  };
  if (graphic) {
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

function jpegHasExif(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) return false;
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

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

async function isAnimated(file: Blob, ext: string, head: Uint8Array) {
  if (ext === "webp") {
    return ascii(head, 12, 4) === "VP8X" && (head[20] & 0x02) !== 0;
  }
  if (ext === "avif") {
    const size = new DataView(head.buffer, head.byteOffset).getUint32(0);
    for (let offset = 8; offset + 4 <= Math.min(size, head.length); offset += 4)
      if (ascii(head, offset, 4) === "avis") return true;
    return false;
  }
  if (ext === "png") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let offset = 8; offset + 8 <= bytes.length;) {
      const type = ascii(bytes, offset + 4, 4);
      if (type === "acTL") return true;
      if (type === "IDAT") return false;
      offset += 12 + view.getUint32(offset);
    }
  }
  return false;
}

export async function shrinkImage(file: Blob): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;
  const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const ext = sniffImageExt(bytes);
  if (!ext || !SHRINKABLE.has(ext) || (await isAnimated(file, ext, bytes))) return file;
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
