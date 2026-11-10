import { strFromU8, unzipSync } from "fflate";
import { api } from "@armin/backend/api";
import { convexClient } from "@/lib/armin-client";
import { ZipWriter } from "@/lib/zip-writer";

export type ExportProgress = { done: number; total: number };

export class ExportError extends Error {}

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
      if (response.status === 404) return null;
      if (!response.ok)
        throw new ExportError(
          `An image or audio file couldn't be downloaded (${response.status}). Check your connection and export again.`,
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== checksum)
        throw new ExportError("An image or audio file arrived damaged. Export again.");
      return bytes;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

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
      else if (row?.status === "failed") settle(new ExportError(row.error ?? "Export failed."));
    };
    const onAbort = () => settle(signal.reason as Error);
    stop = watch.onUpdate(check);
    signal.addEventListener("abort", onAbort);
    check();
  });
}

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
    if (!response.ok) throw new ExportError("The prepared export is no longer available.");
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as {
      counts: Record<string, number>;
      checksums: Record<string, string>;
    };
    const mediaPaths = Object.keys(manifest.checksums).filter(
      (path) => path.startsWith("media/") && !entries[path],
    );

    const zip = new ZipWriter(sink.write);
    await zip.add("manifest.json", entries["manifest.json"], true);
    for (const [path, bytes] of Object.entries(entries))
      if (path !== "manifest.json") await zip.add(path, bytes, true);

    onProgress({ done: 0, total: mediaPaths.length });
    const fetches = new Map<number, Promise<Uint8Array | null>>();
    const startFetch = (index: number) => {
      if (index >= mediaPaths.length) return;
      const path = mediaPaths[index];
      const pending = fetchMedia(path, manifest.checksums[path], signal);
      pending.catch(() => {});
      fetches.set(index, pending);
    };
    for (let index = 0; index < PREFETCH; index++) startFetch(index);
    for (let index = 0; index < mediaPaths.length; index++) {
      const bytes = await fetches.get(index)!;
      fetches.delete(index);
      startFetch(index + PREFETCH);
      if (!bytes)
        throw new ExportError(
          "An image or audio file was deleted while exporting. Export again for a complete copy.",
        );
      await zip.add(mediaPaths[index], bytes, false);
      onProgress({ done: index + 1, total: mediaPaths.length });
    }
    await zip.finish();
    await sink.close();
  } catch (error) {
    await sink.abort().catch(() => {});
    throw error;
  }
}
