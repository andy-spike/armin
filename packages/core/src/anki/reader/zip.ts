/**
 * Lazy ZIP reading. Anki packages can hold gigabytes of media, so the reader
 * parses only the central directory up front and fetches, then inflates, one
 * member at a time from a {@link ByteSource} (a `Blob` in the browser).
 */

import { inflateSync } from "fflate";
import { AnkiImportError } from "./errors";

export type ByteSource = {
  size: number;
  /** Bytes in `[start, end)`. */
  read(start: number, end: number): Promise<Uint8Array>;
};

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
  };
}

export type ZipEntry = {
  name: string;
  /** 0 stored, 8 deflate. */
  method: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
  encrypted: boolean;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_COMMENT_BYTES = 0xffff;
const EOCD_BYTES = 22;
const utf8 = new TextDecoder();

const damaged = () =>
  new AnkiImportError(
    "This file is damaged or incomplete, so it can't be read. Export the deck from Anki again and retry.",
  );

/** Reads every member's name and location, without touching member data. */
export async function readZipDirectory(source: ByteSource) {
  if (source.size < EOCD_BYTES) throw damaged();
  const tailStart = Math.max(0, source.size - EOCD_BYTES - MAX_COMMENT_BYTES);
  const tail = await source.read(tailStart, source.size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  let eocd = -1;
  for (let i = tail.length - EOCD_BYTES; i >= 0; i--) {
    if (tailView.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw damaged();

  const entryCount = tailView.getUint16(eocd + 10, true);
  const directorySize = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new AnkiImportError("ZIP64 archives aren't supported. Export a smaller package.");
  }
  if (directoryOffset + directorySize > source.size) throw damaged();

  const directory = await source.read(directoryOffset, directoryOffset + directorySize);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const entries = new Map<string, ZipEntry>();
  let pos = 0;
  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > directory.length || view.getUint32(pos, true) !== CENTRAL_SIGNATURE) {
      throw damaged();
    }
    const flags = view.getUint16(pos + 8, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const name = utf8.decode(directory.subarray(pos + 46, pos + 46 + nameLength));
    const entry: ZipEntry = {
      name,
      method: view.getUint16(pos + 10, true),
      compressedSize: view.getUint32(pos + 20, true),
      size: view.getUint32(pos + 24, true),
      headerOffset: view.getUint32(pos + 42, true),
      encrypted: (flags & 1) !== 0,
    };
    if (entry.compressedSize === 0xffffffff || entry.size === 0xffffffff) {
      throw new AnkiImportError("ZIP64 archives aren't supported. Export a smaller package.");
    }
    if (!name.endsWith("/")) entries.set(name, entry);
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Fetches and inflates one member. */
export async function readZipEntry(source: ByteSource, entry: ZipEntry) {
  if (entry.encrypted) {
    throw new AnkiImportError(
      "This package is password-protected. Anki packages can't be encrypted; re-export it without a password.",
    );
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new AnkiImportError(
      `This package uses an unsupported ZIP compression method (${entry.method}).`,
    );
  }
  const header = await source.read(entry.headerOffset, entry.headerOffset + 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 30 || view.getUint32(0, true) !== LOCAL_SIGNATURE) throw damaged();
  const dataStart = entry.headerOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  if (dataStart + entry.compressedSize > source.size) throw damaged();
  const raw = await source.read(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return raw;
  try {
    const bytes = inflateSync(raw, { out: new Uint8Array(entry.size) });
    if (bytes.length !== entry.size) throw damaged();
    return bytes;
  } catch (error) {
    if (error instanceof AnkiImportError) throw error;
    throw damaged();
  }
}
