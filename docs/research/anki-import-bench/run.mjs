#!/usr/bin/env node
/**
 * Upload one Anki fixture to this checkout's local Convex deployment, run the
 * experimental Node action against the stored file, and record the result.
 *
 * This is a local benchmark driver, not a product endpoint. It calls internal
 * functions only. It never targets production: it relies on the checkout's
 * `packages/backend/.env.local` selection (a local anonymous deployment).
 *
 * Usage from the repository root:
 *   pnpm --filter @armin/backend dev            # keep running in another shell
 *   pnpm --filter @armin/backend exec convex env set ANKI_BENCH_ENABLED 1
 *   node docs/research/anki-import-bench/run.mjs \
 *     --file .armin/anki-bench/fixtures/large-modern.apkg \
 *     --label large-modern --out .armin/anki-bench/results/large-modern.convex.json
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

const root = resolve(dirname(new URL(import.meta.url).pathname), "../../..");
const { values } = parseArgs({
  options: {
    file: { type: "string" },
    label: { type: "string" },
    out: { type: "string" },
    progress: { type: "string", default: "keep" },
    "read-mode": { type: "string", default: "blob" },
    now: { type: "string", default: "1761696000000" },
    "keep-file": { type: "boolean", default: false },
    "range-probe": { type: "boolean", default: false },
  },
});

if (!values.file) throw new Error("--file is required");
const file = resolve(root, values.file);
const label = values.label ?? basename(file).replace(/\.[^.]+$/, "");
const out = values.out
  ? resolve(root, values.out)
  : resolve(root, ".armin/anki-bench/results", `${label}.convex.json`);

async function verifyReaderCopy() {
  const pairs = [
    [
      "apps/web/src/lib/anki/package-reader.ts",
      "packages/backend/convex/experiments/anki/package_reader.ts",
    ],
    ["apps/web/src/lib/anki/protobuf.ts", "packages/backend/convex/experiments/anki/protobuf.ts"],
    ["apps/web/src/lib/anki/zip.ts", "packages/backend/convex/experiments/anki/zip.ts"],
    ["apps/web/src/lib/anki/errors.ts", "packages/backend/convex/experiments/anki/errors.ts"],
    [
      "apps/web/src/lib/anki/text-import.ts",
      "packages/backend/convex/experiments/anki/text_import.ts",
    ],
  ];
  const mismatches = [];
  for (const [web, backend] of pairs) {
    const [webBytes, backendBytes] = await Promise.all([
      readFile(resolve(root, web)),
      readFile(resolve(root, backend)),
    ]);
    const digest = (value) => createHash("sha256").update(value).digest("hex");
    if (digest(webBytes) !== digest(backendBytes)) mismatches.push({ web, backend });
  }
  if (mismatches.length > 0) {
    throw new Error(`The experiment's reader copy is stale: ${JSON.stringify(mismatches)}`);
  }
}

function convexRun(functionName, args) {
  const stdout = execFileSync(
    "pnpm",
    ["--filter", "@armin/backend", "exec", "convex", "run", functionName, JSON.stringify(args)],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  try {
    return JSON.parse(stdout);
  } catch {
    const start = Math.min(
      ...[stdout.indexOf("{"), stdout.indexOf('"')].filter((index) => index >= 0),
    );
    if (!Number.isFinite(start)) throw new Error(`No JSON in convex run output:\n${stdout}`);
    return JSON.parse(stdout.slice(start));
  }
}

await verifyReaderCopy();
const bytes = await readFile(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const uploadUrl = convexRun("experiments/ankiBenchAdmin:createUploadUrl", {});
const uploadStarted = performance.now();
const uploadResponse = execFileSync(
  "curl",
  [
    "-sS",
    "-X",
    "POST",
    "-H",
    "Content-Type: application/octet-stream",
    "--data-binary",
    `@${file}`,
    uploadUrl,
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 },
);
const uploadMs = performance.now() - uploadStarted;
const { storageId } = JSON.parse(uploadResponse);
if (!storageId) throw new Error(`Upload failed: ${uploadResponse}`);

try {
  const metadata = convexRun("experiments/ankiBenchAdmin:fileMetadata", { storageId });
  const actionStarted = performance.now();
  const result = convexRun("experiments/ankiBench:run", {
    storageId,
    fileName: basename(file),
    progress: values.progress === "fresh" ? "fresh" : "keep",
    now: Number(values.now),
    readMode: values["read-mode"] === "range" ? "range" : "blob",
  });
  const actionWallMs = performance.now() - actionStarted;
  let rangeProbe = null;
  if (values["range-probe"]) {
    rangeProbe = convexRun("experiments/ankiBench:rangeProbe", { storageId, start: 0, end: 1023 });
  }
  const record = {
    label,
    file: values.file,
    bytes: bytes.byteLength,
    sha256,
    upload: { ms: uploadMs, storageId, metadata },
    action: { wallMs: actionWallMs, result },
    rangeProbe,
    measuredAt: new Date().toISOString(),
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(record, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        label,
        out,
        bytes: record.bytes,
        uploadMs,
        actionWallMs,
        totalMs: result.timing.totalMs,
        format: result.format,
        counts: result.counts,
        planDigest: result.planDigest,
        peakRssMb: Math.round(result.memory.final.maxRssKb / 1024),
        growthRssMb: Math.round(result.memory.growth.rss / 1024 / 1024),
        rangeProbe: rangeProbe && { status: rangeProbe.status, bytes: rangeProbe.receivedBytes },
      },
      null,
      2,
    ),
  );
} finally {
  if (!values["keep-file"]) {
    convexRun("experiments/ankiBenchAdmin:deleteFile", { storageId });
  }
}
