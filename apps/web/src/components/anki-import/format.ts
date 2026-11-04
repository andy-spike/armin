export type ProgressMode = "keep" | "fresh";

export const n = (value: number) => value.toLocaleString();
export const plural = (value: number, noun: string) =>
  `${n(value)} ${noun}${value === 1 ? "" : "s"}`;

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
