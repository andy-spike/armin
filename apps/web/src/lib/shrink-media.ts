import { isAudioFile, sniffMediaExt } from "@armin/core/media";
import { shrinkAudio } from "./shrink-audio";
import { shrinkImage } from "./shrink-image";

export const MAX_DEVICE_MEDIA_BYTES = 25 * 1024 * 1024;

export async function shrinkMedia(file: Blob) {
  if (typeof document === "undefined") return file;
  const ext = sniffMediaExt(new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer()));
  if (!ext) return file;
  return isAudioFile(ext) ? shrinkAudio(file) : shrinkImage(file);
}
