/** A typical picture after Armin shrinks it on upload (1600 px WebP). */
export const TYPICAL_PICTURE_BYTES = 180 * 1024;

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Storage sizes for people: "0 MB", "4.2 MB", "120 MB", "1 GB", "2.5 GB". */
export function formatStorage(bytes: number) {
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(1))} GB`;
  const mb = bytes / MB;
  return `${mb > 0 && mb < 10 ? Number(mb.toFixed(1)) : Math.round(mb)} MB`;
}

/** Roughly how many shrunk pictures fit in `bytes`, rounded to the nearest hundred. */
export function picturesIn(bytes: number) {
  return Math.max(0, Math.round(bytes / TYPICAL_PICTURE_BYTES / 100) * 100);
}
