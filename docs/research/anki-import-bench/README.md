# Anki import benchmark harness

Fixtures and a standalone control for the measurements in
[`../convex-anki-import-benchmark.md`](../convex-anki-import-benchmark.md) and
[`../cloudflare-anki-import-benchmark.md`](../cloudflare-anki-import-benchmark.md).

The Convex Node-action experiment (`packages/backend/convex/experiments/` and its
`run.mjs` driver) has been retired; its results stay in the benchmark write-up,
and its code is in Git history. Browser import remains the product path
([ADR 0022](../../../packages/core/docs/adr/0022-anki-import-runs-in-the-browser.md)).

## Standalone control

The control runs the shared reader (`@armin/core/anki/reader`) and converter in a
plain Node process and records timing, memory, warnings, and a digest of the
full import plan:

```bash
pnpm exec tsx docs/research/anki-import-bench/web-baseline.ts \
  --file .armin/anki-bench/fixtures/large-modern.apkg \
  --out .armin/anki-bench/results/large-modern.web.json
```

A matching `planDigest` between two records means the whole `ImportPlan` is
byte-for-byte equal after JSON serialization, not just that card counts agree.
Python 3 with the `anki` package (installed with the Anki desktop app) is only
needed to generate fixtures.

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
