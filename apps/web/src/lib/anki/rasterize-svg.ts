const MAX_SIDE = 2048;
const FALLBACK_SIDE = 512;

export async function rasterizeSvg(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    let width = image.naturalWidth || FALLBACK_SIDE;
    let height = image.naturalHeight || FALLBACK_SIDE;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
