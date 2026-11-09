export const TYPICAL_PICTURE_BYTES = 180 * 1024;

const MB = 1024 * 1024;
const GB = 1024 * MB;

export function formatStorage(bytes: number) {
  if (bytes >= 999.5 * MB) return `${Math.floor((bytes / GB) * 100) / 100} GB`;
  if (bytes > 0 && bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / MB;
  return `${mb > 0 && mb < 10 ? Number(mb.toFixed(1)) : Math.round(mb)} MB`;
}

export function picturesIn(bytes: number) {
  return Math.max(0, Math.round(bytes / TYPICAL_PICTURE_BYTES / 100) * 100);
}
