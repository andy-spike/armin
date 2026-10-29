/**
 * Reads Anki files into a normalized `AnkiCollection` for the converter in
 * `@armin/core/anki`. It runs unchanged in the browser worker and in the
 * Node converter kit: callers inject the SQLite engine (sql.js) and the file
 * bytes (`ByteSource`), so this module loads no SQLite, DOM, or Node API.
 */
export { AnkiImportError, MAX_ANKI_FILE_BYTES } from "./errors";
export { openAnkiPackage, type OpenedAnkiPackage } from "./package-reader";
export { parseAnkiText } from "./text-import";
export { blobSource, type ByteSource } from "./zip";
