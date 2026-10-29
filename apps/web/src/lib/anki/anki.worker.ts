import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import {
  AnkiImportError,
  blobSource,
  MAX_ANKI_FILE_BYTES,
  openAnkiPackage,
  parseAnkiText,
  type OpenedAnkiPackage,
} from "@armin/core/anki/reader";
import type { AnkiWorkerRequest, AnkiWorkerResponse } from "./reader-types";

/**
 * Hosts one open Anki file. SQLite's WASM binary is fetched only when a ZIP
 * package is opened, never for plain-text files.
 */

let opened: OpenedAnkiPackage | null = null;

function send(message: AnkiWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

async function open(file: File) {
  if (file.size > MAX_ANKI_FILE_BYTES) {
    throw new AnkiImportError(
      "This file is larger than 1 GiB, which is too large to import in the browser.",
    );
  }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
  if (isZip) {
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    opened = await openAnkiPackage(blobSource(file), SQL);
    return opened.collection;
  }
  if (/\.(apkg|colpkg)$/i.test(file.name)) {
    throw new AnkiImportError(
      "This file isn't a valid Anki package. Choose an .apkg or .colpkg exported from Anki.",
    );
  }
  const head4k = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (head4k.includes(0)) {
    throw new AnkiImportError(
      "Armin can import Anki packages (.apkg, .colpkg) and text or CSV files. This file is none of those.",
    );
  }
  opened = { collection: parseAnkiText(await file.text(), file.name), readMedia: async () => null };
  return opened.collection;
}

self.onmessage = async (event: MessageEvent<AnkiWorkerRequest>) => {
  const request = event.data;
  if (request.type === "open") {
    try {
      send({ type: "opened", collection: await open(request.file) });
    } catch (error) {
      send({
        type: "error",
        message:
          error instanceof AnkiImportError
            ? error.message
            : "Armin couldn't read this file. It may be damaged or not an Anki export.",
      });
    }
    return;
  }

  try {
    const bytes = (await opened?.readMedia(request.name)) ?? null;
    if (!bytes) {
      send({ type: "media", requestId: request.requestId, bytes: null });
      return;
    }
    // Copy when the bytes are a view into a larger buffer so the transfer is exact.
    const buffer =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? (bytes.buffer as ArrayBuffer)
        : bytes.slice().buffer;
    send({ type: "media", requestId: request.requestId, bytes: buffer }, [buffer]);
  } catch (error) {
    send({
      type: "media-error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Couldn't read this media file.",
    });
  }
};
