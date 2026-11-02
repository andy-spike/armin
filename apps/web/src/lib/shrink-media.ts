import { isAudioFile, sniffMediaExt } from "@armin/core/media";
import { shrinkAudio } from "./shrink-audio";
import { shrinkImage } from "./shrink-image";

/**
 * Largest file the web app accepts from the user. Images and audio shrink on
 * the device first; the server's per-file limit applies to what is uploaded.
 */
export const MAX_DEVICE_MEDIA_BYTES = 25 * 1024 * 1024;

/** Shrink an image or audio file before upload; anything else passes through. */
export async function shrinkMedia(file: Blob) {
  if (typeof document === "undefined") return file;
  const ext = sniffMediaExt(new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer()));
  if (!ext) return file;
  return isAudioFile(ext) ? shrinkAudio(file) : shrinkImage(file);
}
