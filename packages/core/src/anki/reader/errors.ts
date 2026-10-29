/** A problem with the user's Anki file whose message is safe to show as-is. */
export class AnkiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiImportError";
  }
}

/** Largest file the reader accepts; bigger packages would exhaust browser memory. */
export const MAX_ANKI_FILE_BYTES = 1024 * 1024 * 1024;
