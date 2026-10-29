import type { AnkiCollection, ImportOptions, ImportPlan } from "@armin/core/anki";
import { AnkiImportError, MAX_ANKI_FILE_BYTES } from "@armin/core/anki/reader";
import type { AnkiWorkerRequest, AnkiWorkerResponse } from "./reader-types";

/**
 * Browser-side Anki reader. Opens `.apkg`, `.colpkg`, or Anki plain-text/CSV
 * files in a module Worker and exposes the normalized contents.
 *
 *   const reader = await openAnkiFile(file);   // throws AnkiImportError
 *   reader.collection;                         // AnkiCollection, ready for the converter
 *   await reader.convert({ progress: "keep" }); // ImportPlan, converted off the main thread
 *   await reader.readMedia("cat.png");         // Uint8Array | null, decompressed on demand
 *   reader.close();                            // terminates the worker; always call when done
 *
 * Files over 1 GiB are rejected. Media is decompressed one file at a time, so
 * memory stays proportional to the collection database plus the file in flight.
 */
export type AnkiReader = {
  collection: AnkiCollection;
  /** Runs the converter in the worker so large collections never block the page. */
  convert(options: ImportOptions): Promise<ImportPlan>;
  /** Bytes of one media file named as note HTML references it; null if absent from the package. */
  readMedia(name: string): Promise<Uint8Array | null>;
  /** Frees the worker and the file handle. Pending reads reject. */
  close(): void;
};

export { AnkiImportError };

export async function openAnkiFile(file: File): Promise<AnkiReader> {
  if (file.size > MAX_ANKI_FILE_BYTES) {
    throw new AnkiImportError(
      "This file is larger than 1 GiB, which is too large to import in the browser.",
    );
  }

  const worker = new Worker(new URL("./anki.worker.ts", import.meta.url), { type: "module" });
  // Media reads and conversions share one request ID space.
  const pending = new Map<number, { resolve(value: never): void; reject(error: Error): void }>();
  let closed = false;
  let nextRequestId = 0;

  const post = (request: AnkiWorkerRequest) => worker.postMessage(request);
  const close = () => {
    if (closed) return;
    closed = true;
    worker.terminate();
    for (const request of pending.values()) {
      request.reject(new AnkiImportError("The import was cancelled."));
    }
    pending.clear();
  };

  const collection = await new Promise<AnkiCollection>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<AnkiWorkerResponse>) => {
      const message = event.data;
      switch (message.type) {
        case "opened":
          resolve(message.collection);
          break;
        case "error":
          reject(new AnkiImportError(message.message));
          break;
        case "media": {
          const request = pending.get(message.requestId);
          pending.delete(message.requestId);
          request?.resolve((message.bytes ? new Uint8Array(message.bytes) : null) as never);
          break;
        }
        case "converted": {
          const request = pending.get(message.requestId);
          pending.delete(message.requestId);
          request?.resolve(message.plan as never);
          break;
        }
        case "media-error": {
          const request = pending.get(message.requestId);
          pending.delete(message.requestId);
          request?.reject(new AnkiImportError(message.message));
          break;
        }
      }
    };
    worker.onerror = () => {
      reject(
        new AnkiImportError("Armin couldn't start the file reader. Reload the page and retry."),
      );
    };
    post({ type: "open", file });
  }).catch((error) => {
    close();
    throw error;
  });

  const request = <T>(send: (requestId: number) => AnkiWorkerRequest) => {
    if (closed) return Promise.reject<T>(new AnkiImportError("The import was cancelled."));
    const requestId = nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (value: never) => void, reject });
      post(send(requestId));
    });
  };

  return {
    collection,
    convert: (options) =>
      request<ImportPlan>((requestId) => ({ type: "convert", requestId, options })),
    readMedia: (name) =>
      request<Uint8Array | null>((requestId) => ({ type: "media", requestId, name })),
    close,
  };
}
