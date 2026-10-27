import type { AnkiCollection } from "@armin/core/anki";

export type AnkiWorkerRequest =
  | { type: "open"; file: File }
  | { type: "media"; requestId: number; name: string };

export type AnkiWorkerResponse =
  | { type: "opened"; collection: AnkiCollection }
  | { type: "media"; requestId: number; bytes: ArrayBuffer | null }
  | { type: "media-error"; requestId: number; message: string }
  /** A problem with the file itself; `message` is user-facing. */
  | { type: "error"; message: string };
