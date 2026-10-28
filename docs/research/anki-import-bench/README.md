# Anki import Convex benchmark

Repeatable local prototype for the Convex Node-action checkpoint described in
[`../convex-anki-import-benchmark.md`](../convex-anki-import-benchmark.md).
It uploads one Anki package or text export to this checkout's isolated local
Convex deployment, reads it back through Convex File Storage, runs the real
`@armin/core/anki` converter, and records timing, memory, I/O, warnings, and a
digest of the full import plan.

This is not a product feature. The Convex functions are **internal**, live under
`packages/backend/convex/experiments/`, and refuse to run unless the local
deployment has `ANKI_BENCH_ENABLED=1`. Do not set that variable on a deployment
that serves users.

## Prerequisites

- `pnpm worktree:setup` has completed for this checkout (it creates the local
  deployment and installs dependencies).
- The local backend is running; keep it in its own terminal:

  ```bash
  pnpm --filter @armin/backend dev
  ```

- Enable the experiment on that **local** deployment:

  ```bash
  pnpm --filter @armin/backend exec convex env set ANKI_BENCH_ENABLED 1
  ```

- Python 3 with the `anki` package (installed with the Anki desktop app) is only
  needed to generate synthetic fixtures.

## Run one fixture

```bash
# Upload, run the Convex Node action, write a JSON record, delete the upload.
node docs/research/anki-import-bench/run.mjs \
  --file .armin/anki-bench/fixtures/large-modern.apkg \
  --label large-modern \
  --out .armin/anki-bench/results/large-modern.convex.json

# Optional: prove that the local storage URL answers a single HTTP range.
# Add --read-mode range to stream ZIP reads through those range requests
# instead of buffering the whole file with ctx.storage.get.
node docs/research/anki-import-bench/run.mjs \
  --file .armin/anki-bench/fixtures/media-heavy.apkg \
  --label media-heavy-range \
  --read-mode range --range-probe
```

`run.mjs` refuses to run if the browser reader in `apps/web/src/lib/anki/` and
the experiment copy in `packages/backend/convex/experiments/anki/` differ. This
keeps parity checks honest; update the copy when the browser reader changes.

## Standalone control

The control imports the actual web reader and converter in a plain Node process:

```bash
pnpm exec tsx docs/research/anki-import-bench/web-baseline.ts \
  --file .armin/anki-bench/fixtures/large-modern.apkg \
  --out .armin/anki-bench/results/large-modern.web.json
```

Compare `planDigest` and `counts` with the Convex record. A matching digest means
the whole `ImportPlan` is byte-for-byte equal after JSON serialization, not just
that card counts agree.

## Generate synthetic fixtures

Fixtures and results are written under `.armin/`, which is ignored by Git. They
are synthetic; do not describe them as real decks.

```bash
python3 docs/research/anki-import-bench/make-fixture.py \
  --out .armin/anki-bench/fixtures/large-modern.apkg \
  --format modern --notes 30000 --reviews 120000 --field-chars 400

python3 docs/research/anki-import-bench/make-fixture.py \
  --out .armin/anki-bench/fixtures/large-legacy.apkg \
  --format legacy --notes 30000 --reviews 120000 --field-chars 400

python3 docs/research/anki-import-bench/make-fixture.py \
  --out .armin/anki-bench/fixtures/high-compression.apkg \
  --format modern --notes 20000 --reviews 0 --field-chars 8000 --repeat

python3 docs/research/anki-import-bench/make-fixture.py \
  --out .armin/anki-bench/fixtures/media-heavy.apkg \
  --format modern --notes 2000 --reviews 10000 --images 2000 --image-bytes 50000

python3 docs/research/anki-import-bench/make-fixture.py \
  --out .armin/anki-bench/fixtures/large-text.txt \
  --kind text --notes 50000 --field-chars 200
```

`--format legacy` exports a schema-11 `collection.anki21`; `--format modern`
exports a schema-18 zstd `collection.anki21b`. The generator uses Anki's own
export path, so the package layout is real even though the content is synthetic.

## Memory caveats

- `maxRssKb` comes from `process.resourceUsage().maxRSS`. The local Convex Node
  runtime reuses its process between action calls, so `maxRssKb` is a lifetime
  high-water mark that can carry over from an earlier, larger run. For a clean
  peak, restart the local backend before the run.
- `baseline`, `afterGet`, stage snapshots, and `growth` are per-call RSS
  readings. The process may garbage-collect between calls, so `growth` can be
  negative on a reused process.
- These are measurements of the **local open-source backend**. The local backend
  did not enforce the documented 512 MB hosted Node-action cap in this worktree;
  do not treat a local success above that line as evidence about Convex cloud.

## Clean up

```bash
pnpm --filter @armin/backend exec convex env remove ANKI_BENCH_ENABLED
```

Uploads are deleted by `run.mjs` unless `--keep-file` is passed. Fixture and
result files under `.armin/anki-bench/` can be removed at any time.

If the experiment is not carried forward, also remove the prototype-only
`sql.js`, `fzstd`, and `@types/sql.js` dependencies from
`packages/backend/package.json`, and remove `packages/backend/convex/experiments/`
plus the generated API entries it created.
