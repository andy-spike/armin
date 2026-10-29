/**
 * Standalone Node baseline for the browser Anki reader.
 *
 * This imports the real `@armin/core/anki/reader` reader and runs it with the
 * same Node process that executes this script. It is a control for output
 * parity and a rough memory comparison, not a Convex measurement.
 *
 * Usage (from the repository root):
 *   pnpm exec tsx docs/research/anki-import-bench/web-baseline.ts \
 *     --file .armin/anki-bench/fixtures/physics.apkg \
 *     --out .armin/anki-bench/results/physics.web.json
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { convertAnkiCollection, type AnkiCollection } from "../../../packages/core/src/anki/index";
import initSqlJs from "sql.js";
import {
  blobSource,
  openAnkiPackage,
  parseAnkiText,
  type ByteSource,
} from "../../../packages/core/src/anki/reader";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    out: { type: "string" },
    progress: { type: "string", default: "keep" },
    now: { type: "string", default: "1761696000000" },
  },
});

if (!values.file) throw new Error("--file is required");
const file = resolve(root, values.file);

type Stage = { name: string; ms: number; rss: number; heapUsed: number; external: number };

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

async function main() {
  const bytes = await readFile(file);
  const blob = new Blob([bytes]);
  const started = performance.now();
  let last = started;
  const stages: Stage[] = [];
  const mark = (name: string) => {
    const current = performance.now();
    stages.push({ name, ms: current - last, ...memory() });
    last = current;
  };

  const baseline = { ...memory(), maxRssKb: process.resourceUsage().maxRSS };
  const counting = countedSource(blobSource(blob));
  const head = bytes.subarray(0, 4);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  let collection: AnkiCollection;
  let openMs = 0;
  let convertMs = 0;

  if (isZip) {
    const SQL = await initSqlJs({
      locateFile: (name) => join(root, "node_modules/sql.js/dist", name),
    });
    mark("sqljs.init");
    const openStarted = performance.now();
    ({ collection } = await openAnkiPackage(counting.source, SQL));
    openMs = performance.now() - openStarted;
    mark("package.open");
  } else {
    const textStarted = performance.now();
    collection = parseAnkiText(
      blob.text ? await blob.text() : bytes.toString("utf8"),
      basename(file),
    );
    openMs = performance.now() - textStarted;
    mark("text.parse");
  }

  const convertStarted = performance.now();
  const plan = convertAnkiCollection(collection, {
    progress: values.progress === "fresh" ? "fresh" : "keep",
    now: Number(values.now),
  });
  convertMs = performance.now() - convertStarted;
  mark("convert");

  const result = {
    source: "standalone-node-web-reader",
    fileName: file,
    packageBytes: blob.size,
    format: collection.format,
    counts: {
      notetypes: collection.notetypes.length,
      decks: collection.decks.length,
      notes: collection.notes.length,
      cards: collection.cards.length,
      revlog: collection.revlog.length,
      mediaNames: collection.mediaNames.length,
      planFlashcards: plan.flashcards.length,
      planDecks: plan.decks.length,
      reviewUnits: plan.totals.reviewUnits,
      reviewLogs: plan.totals.reviewLogs,
      mediaFiles: plan.totals.mediaFiles,
    },
    warnings: plan.warnings,
    planDigest: digest(plan),
    timing: { openMs, convertMs, totalMs: performance.now() - started },
    io: counting.stats,
    memory: {
      baseline,
      final: { ...memory(), maxRssKb: process.resourceUsage().maxRSS },
      growth: {
        rss: memory().rss - baseline.rss,
        heapUsed: memory().heapUsed - baseline.heapUsed,
        external: memory().external - baseline.external,
        arrayBuffers: memory().arrayBuffers - baseline.arrayBuffers,
      },
      stages,
    },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
  };

  const json = JSON.stringify(result, null, 2);
  if (values.out) {
    await mkdir(dirname(resolve(root, values.out)), { recursive: true });
    await writeFile(resolve(root, values.out), json + "\n");
  }
  console.log(json);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
