import type { AnkiCollection, ImportOptions, ImportPlan } from "@armin/core/anki";

export type AnkiWorkerRequest =
  | { type: "open"; file: File }
  | { type: "media"; requestId: number; name: string }
  | { type: "convert"; requestId: number; options: ImportOptions };

export type AnkiWorkerResponse =
  | { type: "opened"; collection: AnkiCollection }
  | { type: "media"; requestId: number; bytes: ArrayBuffer | null }
  | { type: "media-error"; requestId: number; message: string }
  | { type: "converted"; requestId: number; plan: ImportPlan }
  /** A problem with the file itself; `message` is user-facing. */
  | { type: "error"; message: string };
