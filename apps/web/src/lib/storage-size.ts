/** A typical picture after Armin shrinks it on upload (1600 px WebP). */
export const TYPICAL_PICTURE_BYTES = 180 * 1024;

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Storage sizes for people: "0 MB", "48 KB", "4.2 MB", "120 MB", "0.99 GB",
 * "1 GB", "2.5 GB". Gigabytes round down, so a nearly full pool never reads
 * as full.
 */
export function formatStorage(bytes: number) {
  if (bytes >= 999.5 * MB) return `${Math.floor((bytes / GB) * 100) / 100} GB`;
  if (bytes > 0 && bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / MB;
  return `${mb > 0 && mb < 10 ? Number(mb.toFixed(1)) : Math.round(mb)} MB`;
}

/** Roughly how many shrunk pictures fit in `bytes`, rounded to the nearest hundred. */
export function picturesIn(bytes: number) {
  return Math.max(0, Math.round(bytes / TYPICAL_PICTURE_BYTES / 100) * 100);
}
