# Experimental Anki reader copy

These files are a byte-for-byte copy of the browser reader at
`apps/web/src/lib/anki/` for the Convex Node-action benchmark. They are not a
second implementation: `docs/research/anki-import-bench/run.mjs` hashes every
file against its browser counterpart and refuses to run if they differ.

The benchmark action is internal and gated by `ANKI_BENCH_ENABLED=1`. Keep this
directory out of product code; when the browser reader changes, update the copy
or retire the experiment.
