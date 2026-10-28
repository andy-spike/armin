"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import { convertAnkiCollection, type AnkiCollection } from "@armin/core/anki";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import { internalAction } from "../_generated/server";
import { openAnkiPackage } from "./anki/package_reader";
import { parseAnkiText } from "./anki/text_import";
import { blobSource, type ByteSource } from "./anki/zip";

/**
 * Experimental Anki package reader for the Convex Node action checkpoint.
 *
 * This is deliberately an internal action behind `ANKI_BENCH_ENABLED`: it is
 * not part of the product API, creates no database rows, and only reads a file
 * the caller already uploaded. The benchmark harness in
 * `docs/research/anki-import-bench/` is the only supported caller.
 *
 * The reader files under `./anki/` are a byte-for-byte copy of the browser
 * reader at `apps/web/src/lib/anki/`; `run.mjs` checks their hashes before a
 * run. See `docs/research/convex-anki-import-benchmark.md` for results.
 */

type Stage = {
  name: string;
  ms: number;
  rss: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
};

function memory() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function maxRssKb() {
  return process.resourceUsage().maxRSS;
}

function countedSource(inner: ByteSource) {
  const stats = { reads: 0, bytes: 0, maxRead: 0 };
  const source: ByteSource = {
    size: inner.size,
    async read(start, end) {
      const bytes = await inner.read(start, end);
      stats.reads++;
      stats.bytes += bytes.byteLength;
      stats.maxRead = Math.max(stats.maxRead, bytes.byteLength);
      return bytes;
    },
  };
  return { source, stats };
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function enabled() {
  if (process.env.ANKI_BENCH_ENABLED !== "1") {
    throw new Error("The Anki benchmark action is disabled on this deployment.");
  }
}

function rangeSource(url: string, size: number): ByteSource {
  return {
    size,
    async read(start, end) {
      if (end <= start) return new Uint8Array();
      const response = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
      if (response.status !== 206) {
        throw new Error(
          `File storage did not honor a range request (status ${response.status}); refusing to buffer the whole file.`,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export const run = internalAction({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    progress: v.optional(v.union(v.literal("keep"), v.literal("fresh"))),
    now: v.optional(v.number()),
    readMode: v.optional(v.union(v.literal("blob"), v.literal("range"))),
  },
  handler: async (ctx, args) => {
    enabled();
    const readMode = args.readMode ?? "blob";
    const stages: Stage[] = [];
    const started = performance.now();
    let last = started;
    const mark = (name: string) => {
      const current = performance.now();
      const ram = memory();
      stages.push({ name, ms: current - last, ...ram });
      last = current;
    };

    const baseline = { ...memory(), maxRssKb: maxRssKb() };
    const getStarted = performance.now();
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) throw new Error("The benchmark file no longer exists.");
    let source: ByteSource;
    if (readMode === "range") {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("The benchmark file no longer exists.");
      source = rangeSource(url, metadata.size);
    } else {
      const downloaded = await ctx.storage.get(args.storageId);
      if (!downloaded) throw new Error("The benchmark file no longer exists.");
      source = blobSource(downloaded);
    }
    const getMs = performance.now() - getStarted;
    const afterGet = { ...memory(), maxRssKb: maxRssKb() };
    mark(readMode === "range" ? "storage.url" : "storage.get");

    const counting = countedSource(source);
    let format: string;
    let notes = 0;
    let cards = 0;
    let revlog = 0;
    let decks = 0;
    let notetypes = 0;
    let mediaNames = 0;
    let openMs = 0;
    let parseMs = 0;
    let collection: AnkiCollection;

    const head = await counting.source.read(0, Math.min(4, counting.source.size));
    const isZip = head[0] === 0x50 && head[1] === 0x4b;
    if (isZip) {
      const SQL = await initSqlJs();
      mark("sqljs.init");
      const openStarted = performance.now();
      const opened = await openAnkiPackage(counting.source, SQL);
      openMs = performance.now() - openStarted;
      collection = opened.collection;
      parseMs = 0;
      mark("package.open");
    } else {
      const textStarted = performance.now();
      const textBytes = await counting.source.read(0, counting.source.size);
      const text = new TextDecoder().decode(textBytes);
      collection = parseAnkiText(text, args.fileName);
      parseMs = performance.now() - textStarted;
      openMs = parseMs;
      mark("text.parse");
    }
    format = collection.format;
    notes = collection.notes.length;
    cards = collection.cards.length;
    revlog = collection.revlog.length;
    decks = collection.decks.length;
    notetypes = collection.notetypes.length;
    mediaNames = collection.mediaNames.length;

    const convertStarted = performance.now();
    const plan = convertAnkiCollection(collection, {
      progress: args.progress ?? "keep",
      now: args.now ?? Date.now(),
    });
    const convertMs = performance.now() - convertStarted;
    mark("convert");

    const totalMs = performance.now() - started;
    const final = { ...memory(), maxRssKb: maxRssKb() };
    const result = {
      fileName: args.fileName,
      readMode,
      packageBytes: metadata.size,
      format,
      counts: {
        notetypes,
        decks,
        notes,
        cards,
        revlog,
        mediaNames,
        planFlashcards: plan.flashcards.length,
        planDecks: plan.decks.length,
        reviewUnits: plan.totals.reviewUnits,
        reviewLogs: plan.totals.reviewLogs,
        mediaFiles: plan.totals.mediaFiles,
      },
      warnings: plan.warnings,
      planDigest: digest(plan),
      timing: { storageGetMs: getMs, openMs, parseMs, convertMs, totalMs },
      io: counting.stats,
      memory: {
        baseline,
        afterGet,
        final,
        growth: {
          rss: final.rss - baseline.rss,
          heapUsed: final.heapUsed - baseline.heapUsed,
          external: final.external - baseline.external,
          arrayBuffers: final.arrayBuffers - baseline.arrayBuffers,
        },
        stages,
      },
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        v8: process.versions.v8,
      },
    };
    return result;
  },
});

export const rangeProbe = internalAction({
  args: {
    storageId: v.id("_storage"),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    enabled();
    const baseline = memory();
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("The benchmark file no longer exists.");
    const start = args.start ?? 0;
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) throw new Error("The benchmark file no longer exists.");
    const end = args.end ?? Math.min(1023, metadata.size - 1);
    const started = performance.now();
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    const bytes = await response.arrayBuffer();
    return {
      status: response.status,
      contentRange: response.headers.get("content-range"),
      contentLength: response.headers.get("content-length"),
      receivedBytes: bytes.byteLength,
      ms: performance.now() - started,
      memory: { baseline, final: memory() },
    };
  },
});
