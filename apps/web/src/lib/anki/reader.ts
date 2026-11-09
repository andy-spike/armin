import type { AnkiCollection, ImportOptions, ImportPlan } from "@armin/core/anki";
import { AnkiImportError, MAX_ANKI_FILE_BYTES } from "@armin/core/anki/reader";
import type { AnkiWorkerRequest, AnkiWorkerResponse } from "./reader-types";

export type AnkiReader = {
  collection: AnkiCollection;
  convert(options: ImportOptions): Promise<ImportPlan>;
  readMedia(name: string): Promise<Uint8Array | null>;
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
