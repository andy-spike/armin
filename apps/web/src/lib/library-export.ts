import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { api } from "@armin/backend/api";
import { convexClient } from "@/lib/armin-client";

/**
 * Library exports are assembled in the browser. The server prepares a small
 * ZIP with the manifest and JSON data; the browser downloads it, fetches each
 * image and audio file through the authenticated media route, checks it
 * against the manifest checksum, and writes one finished ZIP. Nothing on the
 * server has to hold the whole library, so exports have no size ceiling.
 *
 * Chrome and Edge stream the ZIP straight to the file the user picked. Other
 * browsers build it in memory and then download it.
 */

export type ExportProgress = { done: number; total: number };

export type ExportSink = {
  write: (chunk: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
}>;

/** Media fetched ahead of the one being written, to keep the network busy. */
const PREFETCH = 4;

function memorySink(fileName: string): ExportSink {
  const chunks: Uint8Array[] = [];
  return {
    write: async (chunk) => {
      chunks.push(chunk);
    },
    close: async () => {
      const url = URL.createObjectURL(new Blob(chunks as BlobPart[], { type: "application/zip" }));
      chunks.length = 0;
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    abort: async () => {
      chunks.length = 0;
    },
  };
}

/**
 * Ask where to save the export. Call it directly from a click: the save
 * picker needs the user's gesture. Returns null when the user cancels.
 */
export async function chooseExportSink(fileName: string): Promise<ExportSink | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!picker) return memorySink(fileName);
  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
    });
    const writable = await handle.createWritable();
    return {
      write: (chunk) => writable.write(chunk),
      close: () => writable.close(),
      abort: () => writable.abort(),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return memorySink(fileName);
  }
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchMedia(path: string, checksum: string, signal: AbortSignal) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetch(`/${path}`, { signal, credentials: "same-origin" });
      // Deleted since the export was prepared: nothing references it any more.
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Couldn't download ${path} (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== checksum)
        throw new Error(`${path} didn't match its checksum.`);
      return bytes;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** Wait until the server has prepared an export's data; throws if it failed. */
export function waitForExport(exportId: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const watch = convexClient().watchQuery(api.exports.list, {});
    let stop = () => {};
    const settle = (error?: Error) => {
      stop();
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      const row = watch.localQueryResult()?.find((candidate) => candidate.id === exportId);
      if (row?.status === "ready") settle();
      else if (row?.status === "failed") settle(new Error(row.error ?? "Export failed."));
    };
    const onAbort = () => settle(signal.reason as Error);
    stop = watch.onUpdate(check);
    signal.addEventListener("abort", onAbort);
    check();
  });
}

/** Download the prepared export and write the finished ZIP to `sink`. */
export async function assembleExport({
  exportId,
  sink,
  signal,
  onProgress,
}: {
  exportId: string;
  sink: ExportSink;
  signal: AbortSignal;
  onProgress: (progress: ExportProgress) => void;
}) {
  try {
    const response = await fetch(`/api/export/${exportId}`, { signal });
    if (!response.ok) throw new Error("The prepared export is no longer available.");
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as {
      counts: Record<string, number>;
      checksums: Record<string, string>;
    };
    const mediaPaths = Object.keys(manifest.checksums).filter((path) => path.startsWith("media/"));

    let writing = Promise.resolve();
    let zipError: unknown = null;
    const zip = new Zip((error, chunk) => {
      if (error) zipError = error;
      else writing = writing.then(() => sink.write(chunk));
    });
    const add = (path: string, bytes: Uint8Array, compress: boolean) => {
      const file = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
      zip.add(file);
      file.push(bytes, true);
    };
    for (const [path, bytes] of Object.entries(entries))
      if (path !== "manifest.json") add(path, bytes, true);

    onProgress({ done: 0, total: mediaPaths.length });
    const fetches: Promise<Uint8Array | null>[] = [];
    const startFetch = (index: number) => {
      if (index >= mediaPaths.length) return;
      const path = mediaPaths[index];
      const pending = fetchMedia(path, manifest.checksums[path], signal);
      pending.catch(() => {}); // awaited in order below
      fetches[index] = pending;
    };
    for (let index = 0; index < PREFETCH; index++) startFetch(index);
    for (let index = 0; index < mediaPaths.length; index++) {
      const bytes = await fetches[index];
      startFetch(index + PREFETCH);
      const path = mediaPaths[index];
      // Images and audio are already compressed, so they're stored as-is.
      if (bytes) add(path, bytes, false);
      else {
        delete manifest.checksums[path];
        manifest.counts.media -= 1;
      }
      // Wait for the disk (or memory) to catch up before fetching further.
      await writing;
      if (zipError) throw zipError;
      onProgress({ done: index + 1, total: mediaPaths.length });
    }
    // Written last so it reflects any media deleted while exporting.
    add("manifest.json", strToU8(JSON.stringify(manifest, null, 2)), true);
    zip.end();
    await writing;
    if (zipError) throw zipError;
    await sink.close();
  } catch (error) {
    await sink.abort().catch(() => {});
    throw error;
  }
}
