export class AnkiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiImportError";
  }
}

export const MAX_ANKI_FILE_BYTES = 1024 * 1024 * 1024;
