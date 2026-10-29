import type { ImportDeck, ImportPlan } from "@armin/core/anki";
import { AnkiImportError, openAnkiFile, type AnkiReader } from "./reader";

/** An Anki file read in the browser, ready for the import page. */
export type OpenedAnkiFile = {
  reader: AnkiReader;
  fileName: string;
  fileSize: number;
  openedAt: number;
  /** Every deck the file offers, for the checklist; selection only changes the plan. */
  decks: ImportDeck[];
  initialPlan: ImportPlan;
};

/** Reads and converts a file. Throws an `AnkiImportError` with a user-facing message. */
export async function openAnkiImport(file: File): Promise<OpenedAnkiFile> {
  let reader: AnkiReader | null = null;
  try {
    reader = await openAnkiFile(file);
    const openedAt = Date.now();
    const initialPlan = await reader.convert({ progress: "keep", now: openedAt });
    if (initialPlan.decks.length === 0) {
      throw new AnkiImportError(
        "This file doesn't contain any cards Armin can import. Check that it's an Anki export with at least one note.",
      );
    }
    return {
      reader,
      fileName: file.name,
      fileSize: file.size,
      openedAt,
      decks: initialPlan.decks,
      initialPlan,
    };
  } catch (error) {
    reader?.close();
    throw error instanceof AnkiImportError
      ? error
      : new AnkiImportError(
          "Armin couldn't read this file. Check that it's an Anki export and try again.",
        );
  }
}

// The open file holds a Worker, which can't travel through the URL, so the
// dialog hands it to the import page here. Leaving the page releases it.
let current: OpenedAnkiFile | null = null;

export function setOpenedAnkiFile(file: OpenedAnkiFile | null) {
  if (current && current !== file) current.reader.close();
  current = file;
}

export function getOpenedAnkiFile() {
  return current;
}
