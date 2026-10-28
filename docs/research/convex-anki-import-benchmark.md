# Convex Node-action Anki import benchmark

Benchmarked 2026-10-28 against this worktree's isolated local Convex deployment.
This is an experimental checkpoint, not a production deployment, migration, or
performance guarantee. No commit, push, PR, or production change was made.

## Verdict

**Partially proved.** The important mechanics work:

- `sql.js` 1.15.1 runs in a Convex `"use node"` action when bundled with its
  inline-WASM build; `fzstd` handles schema-18 compressed collections.
- An action can read an uploaded archive from Convex File Storage and run the
  existing browser reader and `@armin/core/anki` converter.
- Converted output matched the current browser importer exactly on all 13
  benchmark comparisons across 11 inputs (full `ImportPlan` digest and counts).
- A range-backed `ByteSource` over `storage.getUrl()` works locally: HTTP 206,
  and a 96 MiB media archive used 249 MiB peak RSS instead of 540 MiB when
  buffered with `ctx.storage.get`.

**But the hosted limits are not proved, and the current reader does not fit
large inputs inside the documented 512 MiB budget.** Local peaks reached 909 MiB
for a 1.5 MiB highly compressed package, 771 MiB for a 12 MiB text export, and
626–658 MiB for the real 34,590-card AnKing package. The local backend did not
enforce the 512 MiB cap, so those local successes are explicitly **not** evidence
that Convex cloud would accept them.

Do not proceed to the full importer migration as designed until the hosted spike
and the parser-memory work below are done.

## Environment

| Item                       | Value                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| Convex CLI / local backend | 1.47.0                                                           |
| Node in the action         | v24.22.1                                                         |
| `sql.js`                   | 1.15.1, `dist/sql-wasm-inline.js`                                |
| `fzstd`                    | 0.1.1                                                            |
| Host                       | Linux x64, 30 GiB RAM, no cgroup matching the hosted 512 MiB cap |
| Deployment                 | checkout-local anonymous local deployment, no Convex account     |

Official facts used below:

- Node actions have **512 MB memory** and a **10 minute** execution limit.
  <https://docs.convex.dev/functions/actions#limits>
- Node action arguments are limited to 5 MiB; function values generally to
  16 MiB. <https://docs.convex.dev/production/state/limits#functions>
- File uploads have **no documented file-size limit**, but the upload POST has a
  **2 minute timeout**. <https://docs.convex.dev/file-storage/upload-files#limits>

## Method

The experiment adds an internal Node action at
`packages/backend/convex/experiments/ankiBench.ts`. It is gated by
`ANKI_BENCH_ENABLED=1` and is not part of the public API. The benchmark driver
uploads a file with Convex's generated upload URL, passes only the storage ID to
the action, and deletes the upload afterwards.

The action's reader files under
`packages/backend/convex/experiments/anki/` are byte-for-byte copies of
`apps/web/src/lib/anki/`. `run.mjs` checks their SHA-256 hashes before every run.
The action runs the same `convertAnkiCollection` with the same fixed `now`, then
hashes `JSON.stringify(plan)`. The standalone control imports the actual web
reader and converter in plain Node and hashes the same value. A digest match
therefore compares the entire import plan, not only counts.

Two file-reading modes were measured:

- **blob**: `ctx.storage.get(storageId)`, then `blobSource(blob)`. This is the
  direct analogue of the browser's `Blob` source.
- **range**: `ctx.storage.getUrl(storageId)` plus a `ByteSource` that issues
  `fetch(url, { headers: { Range } })` and requires HTTP 206. ZIP reads stay
  range-based; no whole-archive buffer is created.

## Results

All times are action time (`performance.now()` around the work), not upload or
CLI overhead. RSS is `process.memoryUsage().rss`. "Peak" is the largest stage
snapshot or the process high-water mark, whichever is larger. Most rows were run
immediately after restarting the local backend, so the Node action process
started without a prior large call; those are the peaks treated as clean. A few
rows share a process, and their absolute peak can include that earlier work.
`large-legacy` ran after the small geography run in the same process (baseline
230 MiB); its 531 MiB peak is still a valid upper bound. Timing and output
digests are unaffected by process reuse.

### Real packages

These are downloaded real packages from the parent worktree's ignored
`.armin/anki-artifacts/`, not synthetic data and not copied into Git. Their
SHA-256 values are recorded in the parent's
[`2026-10-27-anki-originals-final.md`](../qa/2026-10-27-anki-originals-final.md):
`physics.apkg` `5666b4e…`, `geography.apkg` `cd4a2c5…`, `anking.apkg`
`2e6f6b6…`.

| Package          | Format             |           Package size | Cards / units / logs | Read  | Action | Peak RSS | Peak − baseline | Result       |
| ---------------- | ------------------ | ---------------------: | -------------------- | ----- | -----: | -------: | --------------: | ------------ |
| `physics.apkg`   | schema 11 `anki21` |               0.09 MiB | 108 / 108 / 0        | blob  | 0.16 s |  221 MiB |         +77 MiB | pass         |
| `geography.apkg` | schema 11 `anki21` |               14.4 MiB | 757 / 757 / 0        | blob  | 0.21 s |  243 MiB |         +98 MiB | pass         |
| `anking.apkg`    | schema 11 `anki2`  | 26.4 MiB (74.6 MiB DB) | 34,590 / 43,136 / 0  | blob  | 8.07 s |  658 MiB |        +511 MiB | over 512 MiB |
| `anking.apkg`    | schema 11 `anki2`  | 26.4 MiB (74.6 MiB DB) | 34,590 / 43,136 / 0  | range | 7.61 s |  627 MiB |        +475 MiB | over 512 MiB |

AnKing is currently blocked by the 2,000-card / 10,000-unit product limits, so
this measures parsing and preview generation, not a permitted import. The real
package has no review history in these runs. Range reading saved only ~31 MiB
because the collection and converter dominate.

### Synthetic fixtures at or below the current limits

Synthetic content is deterministic and generated with Anki's own exporter. It is
not real-world data; card counts are chosen, not sampled.

| Fixture            | Package size |  DB size | Cards / units / logs                   | Read  | Action | Peak RSS | Peak − baseline | Result       |
| ------------------ | -----------: | -------: | -------------------------------------- | ----- | -----: | -------: | --------------: | ------------ |
| `limit-max.apkg`   |     0.26 MiB |  3.7 MiB | 2,000 / 2,000 / 10,000                 | blob  | 0.31 s |  274 MiB |        +130 MiB | pass         |
| `limit-text.txt`   |     0.48 MiB |      n/a | 2,000 / 2,000 / 0                      | blob  | 0.14 s |  214 MiB |         +70 MiB | pass         |
| `max-content.apkg` |     0.32 MiB | 40.1 MiB | 2,000 / 2,000 / 10,000, 19k chars/card | blob  | 0.93 s |  490 MiB |        +346 MiB | near limit   |
| `media-heavy.apkg` |     96.1 MiB |  1.8 MiB | 2,000 / 2,000 / 10,000, 2,000 images   | blob  | 0.42 s |  540 MiB |        +396 MiB | over 512 MiB |
| `media-heavy.apkg` |     96.1 MiB |  1.8 MiB | 2,000 / 2,000 / 10,000, 2,000 images   | range | 0.42 s |  249 MiB |        +105 MiB | pass         |

`max-content` is allowed by the current 20,000-character content limit but leaves
only ~22 MiB below the documented cap on this local runtime. It is not safe
headroom. The media fixture has a small collection database; its cost is almost
entirely the 96 MiB source archive, which `ctx.storage.get` amplifies to a
~317 MiB RSS increase (base 144 → 461 MiB after `get`). Range mode was 249 MiB
peak and read only 0.4 MiB from the archive.

### Synthetic over-limit and adversarial cases

| Fixture                 | Package size |   DB size | Cards / logs     | Action | Peak RSS | Peak − baseline | Result                              |
| ----------------------- | -----------: | --------: | ---------------- | -----: | -------: | --------------: | ----------------------------------- |
| `large-modern.apkg`     |     2.69 MiB |  28.9 MiB | 30,000 / 120,000 | 1.73 s |  481 MiB |        +337 MiB | just under 512; over product limits |
| `large-legacy.apkg`     |     3.65 MiB |  28.9 MiB | 30,000 / 120,000 | 1.79 s |  531 MiB |        +301 MiB | over 512 MiB; over product limits   |
| `high-compression.apkg` |     1.46 MiB | 159.5 MiB | 20,000 / 0       | 3.35 s |  909 MiB |        +762 MiB | over 512 MiB                        |
| `large-text.txt`        |     12.2 MiB |       n/a | 50,000 / 0       | 1.69 s |  771 MiB |        +627 MiB | over 512 MiB                        |

The high-compression case is the clearest packaging warning: a **1.5 MiB**
upload expands to a **159.5 MiB** SQLite database (109×) and reaches **909 MiB**
peak RSS (5.7× the decompressed database). Upload size is not a proxy for
processing memory. Likewise, a 96 MiB media archive with a 1.8 MiB collection is
cheap to parse but expensive to buffer whole.

The 30,000-card cases are above the product limits. They matter because the
current reader materializes every note, card, and review before the converter or
the quota check sees them; a quota rejection cannot undo that memory use.

## Parity with the current importer

All 13 compared runs across 11 inputs produced **identical** `planDigest` values and counts:

- `physics.apkg`
- `geography.apkg`
- `anking.apkg` (blob and range)
- `large-modern.apkg`
- `large-legacy.apkg`
- `high-compression.apkg`
- `media-heavy.apkg` (blob and range)
- `limit-max.apkg`
- `max-content.apkg`
- `large-text.txt`
- `limit-text.txt`

The text exports initially differed only because the control passed an absolute
path as the file name and the action passed a basename, which changes the
synthesized deck name. The harness now passes the basename in both places, and
both text digests match. This was a harness bug, not a reader difference.

## Packaging, memory, and limits

### `sql.js` / WASM

- A plain Convex Node action cannot rely on the browser's
  `import wasmUrl from "...?url"` asset convention. The experiment uses
  `sql.js/dist/sql-wasm-inline.js`, which embeds the WASM binary (about 0.96 MB
  of JavaScript) and needs no runtime asset lookup. `initSqlJs()` succeeded in
  the local Convex action in 12–28 ms.
- The action bundle and WASM are well below Convex's 230 MB code-size limit.
- This proves the inline build only. It does not prove that the normal
  `sql.js` build, which looks for `sql-wasm.wasm` next to the JS at runtime,
  would work without an asset-import change.
- The prototype adds `sql.js`, `fzstd`, and `@types/sql.js` to
  `packages/backend`. Remove them, the `convex/experiments/` directory, and the
  generated API entries if the checkpoint is rejected.
- `sql.js` holds the whole decompressed SQLite database in WASM memory and the
  reader copies rows into JavaScript arrays. There is no streaming SQLite
  cursor in the current reader: `readNotes`, `readCards`, and `readRevlog` build
  full arrays before conversion.

### File storage reads

`ctx.storage.get` returned a fully materialized `Blob` in the local action. For
the 96.1 MiB archive, call RSS rose from 144 MiB to 461 MiB — roughly **3.3×**
the file size. The staged memory snapshots show the spike before ZIP parsing.
That is consistent with the action syscall transporting bytes through a base64
string before constructing the `Blob`; it is a local observation, not a hosted
measurement.

The range path was materially better:

- `storage.getUrl` + `Range: bytes=0-1023` returned **206 Partial Content** with
  `Content-Range: bytes 0-1023/...`, in 1.4 ms locally.
- The 96.1 MiB media package then used 249 MiB peak RSS and read 0.4 MiB through
  the ZIP reader.
- Convex's local backend source explicitly supports a single range and notes
  that the underlying AWS S3 only supports a single range:
  <https://github.com/get-convex/convex-backend/blob/88a2a911/crates/local_backend/src/storage.rs>.
  This is implementation evidence for cloud range support, **not** a hosted
  test. Cloud behavior remains unverified.

A production range reader must not return the bearer `storage.getUrl` to the
client. The URL is only for the action's internal fetch.

### Local vs hosted

The local backend **did not enforce the documented 512 MB Node-action cap**. It
accepted a 909 MiB action and returned a valid result. The local action process
is reused between calls: `maxRSS` is a process lifetime high-water mark, which is
why several non-fresh rows show a peak inherited from an earlier run. Clean
measurements were obtained by restarting `pnpm --filter @armin/backend dev`
before the run.

Therefore:

- **Local backend**: measured; no 512 MB enforcement observed; useful for
  packaging, parity, and relative memory behavior.
- **Standalone Node**: measured only as an output and rough-memory control; it
  often used more RSS than the Convex action (e.g. 833 MiB vs 481 MiB peak on the
  30k modern fixture, 1,187 MiB vs 909 MiB on high compression). It is not a
  limit proof in either direction.
- **Hosted Convex**: not measured. No cloud deployment or credentials were used.
  The 512 MB / 10 minute limits remain the authoritative constraint, and no
  success is inferred for cases above 512 MiB locally.

### Ten-minute limit

The longest action in this set was AnKing at 8.07 s; high compression was 3.35 s
and the 30k modern case 1.73 s. None approaches ten minutes. That does **not**
prove a large media extraction/import workflow will fit: this checkpoint reads
the collection and media list, not every media byte, image validation, storage
write, or card batch. The 10-minute boundary was not exercised.

## Upload envelope

Local loopback uploads are fast but say nothing about a user's network:

| Fixture              | Local upload |
| -------------------- | -----------: |
| 26.4 MiB AnKing      |      78.6 ms |
| 96.1 MiB media-heavy |     172.9 ms |
| 12.2 MiB text        |      52.6 ms |

With the documented 2-minute POST timeout, and ignoring TCP/TLS overhead, the
theoretical maximum at sustained throughput is:

| Sustained upload | Bytes in 120 s |
| ---------------: | -------------: |
|          10 Mbps |        ~150 MB |
|          25 Mbps |        ~375 MB |
|          50 Mbps |        ~750 MB |
|         100 Mbps |        ~1.5 GB |

A 1 GiB archive needs about **72 Mbps sustained for the full two minutes**, with
no headroom for TLS, retries, or a slower moment. A 100 MB cap fits a 10 Mbps
uplink with about 40 s to spare. The existing browser limit of 1 GiB is not a
supported server-side envelope for this one-POST upload design.

The upload POST constraint is separate from processing memory: a file can upload
in under two minutes and still exceed the action's memory budget.

## Accepted envelope on this local runtime

This is an empirical local envelope, not a hosted promise.

- **Comfortable with headroom:** 2,000 cards, 10,000 review logs, modest text,
  and an archive up to roughly 100 MiB read via range. The limit fixtures peaked
  at 274 MiB (structured) and 214 MiB (text); the 96 MiB media fixture with range
  reading peaked at 249 MiB.
- **Technically under 512 MiB, but not safe:** 2,000 cards at 19k chars/card
  reached 490 MiB. The current 20k-character content limit can consume nearly
  the whole budget; one more copy or a larger batch would cross it.
- **Over the line locally:** the real AnKing package (627–658 MiB), a 30k-card
  legacy collection (531 MiB), a 50k-row text export (771 MiB), and a 1.5 MiB
  highly compressed package (909 MiB).
- **Not a function of upload size:** 1.5 MiB can be worse than 96 MiB. Limits
  must be based on decompressed collection size, row counts, content length,
  and whether the archive is buffered.

The current product limits (2,000 cards, 10,000 units, 10 MiB per image, 80 MiB
images per library) do not by themselves protect the action: the reader and
converter run before those limits are applied. A server-side preview of a file
that will ultimately be rejected can still exhaust memory.

## What is proven, and what is not

Proven on the local backend:

- `sql.js` inline-WASM and `fzstd` bundle and run in a real Convex Node action.
- Convex File Storage upload, storage-ID handoff, metadata, deletion, and
  `ctx.storage.get` work for the tested files.
- Local storage URLs honor a single HTTP range (206) and a range-backed ZIP
  source works end-to-end.
- The action's output is exactly equal to the current browser reader plus
  converter on 13 real/synthetic comparisons (11 inputs, two read modes).
- The measured local memory envelope above.

Not proven:

- Hosted Convex 512 MB enforcement or behavior at/above the limit.
- Hosted Range support for `storage.getUrl` URLs.
- The 10-minute limit under media-heavy extraction and import batches.
- Actual media byte reads, image validation, image upload, card/history batches,
  Workflow/Rate Limiter, cancellation, retries, or cleanup.
- Upload behavior on real slow/lossy/mobile networks, resumability, or the
  2-minute timeout at scale.
- Damaged files, schema versions beyond 18, or formats not represented here.
- AnKing import as a product flow; only parsing/preview generation was measured,
  and the current limits block it anyway.

## Recommendation

1. **Keep the checkpoint open.** The packaging and parity pieces pass, but the
   large-file cases do not fit the documented hosted budget with the current
   reader.
2. **Use range-backed reads for source archives.** Do not call
   `ctx.storage.get` on user uploads. Keep the bearer URL internal. Verify 206
   behavior on a non-production Convex cloud deployment before relying on it.
3. **Add a streaming/preflight reader.** Count decks, notes, cards, and review
   rows from SQLite without materializing every row, or apply the product limits
   while reading. Today an over-limit AnKing or 30k-card file builds the full
   collection before the quota rejection; that is where the 512 MiB budget is
   lost.
4. **Set the upload cap from network reality, not the browser's 1 GiB.** A
   ~100 MiB cap is supportable at 10 Mbps within 2 minutes; 1 GiB is not a
   reasonable one-POST promise for typical users. If 1 GiB must be supported,
   use a resumable/multipart or object-storage path (for example R2) rather than
   a single Convex upload POST.
5. **Re-run this harness on a non-production hosted deployment** with at least:
   a 2,000-card/10,000-log fixture, the 19k-character fixture, a 100 MiB
   media-heavy fixture through range, and the real AnKing package. Do not treat
   the local 909 MiB success as a pass. No hosted deployment was created or
   contacted in this work.
6. **If AnKing-scale previews are a requirement**, either raise the action
   memory limit through Convex (subject to plan/support), move parsing to a
   larger external worker, or keep the browser-side path for oversized files.
   Workflow and Rate Limiter do not change an individual action's memory budget.

## Reproduce

The harness and exact commands are in
[`anki-import-bench/README.md`](anki-import-bench/README.md). In short:

```bash
pnpm --filter @armin/backend dev
pnpm --filter @armin/backend exec convex env set ANKI_BENCH_ENABLED 1

# Real package, if available locally; do not commit downloaded decks.
node docs/research/anki-import-bench/run.mjs \
  --file /path/to/anking.apkg --label anking-range --read-mode range

# Synthetic fixtures.
python3 docs/research/anki-import-bench/make-fixture.py \
  --out .armin/anki-bench/fixtures/large-modern.apkg \
  --format modern --notes 30000 --reviews 120000 --field-chars 400
pnpm exec tsx docs/research/anki-import-bench/web-baseline.ts \
  --file .armin/anki-bench/fixtures/large-modern.apkg \
  --out .armin/anki-bench/results/large-modern.web.json
node docs/research/anki-import-bench/run.mjs \
  --file .armin/anki-bench/fixtures/large-modern.apkg --label large-modern

pnpm --filter @armin/backend exec convex env remove ANKI_BENCH_ENABLED
```

For a clean `maxRSS` reading, restart the local backend before the run; the
action process is reused and its high-water mark otherwise carries over. All
fixtures, results, and uploaded files are local and ignored by Git; downloaded
real decks must not be committed.
