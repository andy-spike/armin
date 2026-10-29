# Performance implementation QA — 2026-10-29

Environment: isolated local anonymous Convex deployment on ports 28586/28587;
web at `http://armin-9fd4963365.localhost:28584`; Android Expo Go on the
`Armin_Pixel_7_API_36` emulator (Android 16). This was an emulator, not a physical
phone. Web walkthrough used agent-browser's Chromium session `armin-perf`.
Production was not accessed or deployed.

## Measurements

Temporary local-only baseline modules reproduced the checkout's original Stats,
queue, and Cram selectors. A diagnostic query wrapped database reads and counted
returned documents plus the length of their JSON serialization. These byte
counts are estimates, not Convex billing bytes. All diagnostic/baseline/fixture
functions were removed after measurement. No test suite was added.

The fixture had 20 basic cards with approximately 16,000 content characters each,
20 due review units, 500 scheduled Again logs, and 500 Cram logs distributed over
300 days. Five alternating baseline/new samples used the same fixture and almost
identical timestamps. See `local-read-comparison.json` for the raw results.

| Path | Baseline rows → new rows | Estimated JSON read bytes | Median local round trip |
| --- | --- | --- | --- |
| Stats overview, fixture deck | 1,062 → 322 | 1,477,336 → 81,933 | 216 → 157 ms |
| Review queue, fixture deck | 46 → 27 | 660,082 → 10,382 | 78 → 55 ms |
| Cram forgotten selection | 522 → 22 | 655,139 → 8,815 | 103 → 55 ms |

Queue payload was 647,024 → 6,564 bytes in that intermediate implementation;
subsequent descriptor cleanup also removed empty placeholder content fields.
The new queue intentionally requires a separate content-window request, so this
is not an end-to-end first-card latency comparison. Queue IDs/order and Cram
membership matched in every paired sample; Stats totals and retention matched.
Do not interpret these local medians as production p95s or Core Web Vitals.

A later import-style stress batch inserted another 1,000 scheduled logs and
1,000 Cram logs in one local mutation. Activity then totaled 3,000. Trigger work
coalesces library/deck deltas and caches source documents within a mutation.

A second check used the real import API: ten 100-card batches followed by one
1,000-log batch across 1,000 distinct cards. This exposed a 4,096-read limit in
the first implementation. Large log batches now load compact unit identifiers
and ownership in bulk and prime the activity cache; boundary updates also use a
bulk read. The retried 1,000-log transaction passed (1,776 ms local round trip),
import completion succeeded, and Stats reported exactly 1,000 activities with
`pending: false`. See `import-stress-result.json`.

The synthetic image was a 2000×1400 PNG with random pixels: 8,416,349 bytes.
Its 1280×896 authenticated WebP preview was 688,670 bytes (91.8% smaller). The
browser loaded that preview on the review card and the 2000×1400 original when
zoom opened. The image declared width=2000, height=1400, eager loading for the
active prompt, and async decoding. A request for the private preview without a
session returned HTTP 401. This synthetic image demonstrates the mechanism,
not an expected reduction for every real image.

## Behavior verified

- Backend source compiled and pushed successfully to the local deployment.
- Existing library backfill completed; scheduled jobs reported success and
  `statsReady` became true.
- The 3,000-activity fixture was moved to a second deck: library activity stayed
  3,000, source deck became 0, destination became 3,000. Full Stats responses
  matched the original implementation apart from the added readiness field.
- Timezone changed from UTC to America/Bogota. The rebuilt generation matched
  the original full Stats response, with `pending: false` after completion.
- Scheduled rating increased total activity 3,000 → 3,001. Undo restored 3,000.
- Deleting the history-bearing card made activity 0 immediately and matched the
  original query, before asynchronous history cleanup completed.
- A separate six-activity fixture verified deck deletion: activity 6 → 0,
  matching the original query. Synthetic benchmark decks were removed afterward.
- Web: Decks/sidebar counts, Stats, Browse, review image display/zoom, reveal,
  Good rating, completion, and Undo were walked through. Undo restored the
  prompt and image. Cram with maximum=1 produced a one-card session; reveal,
  Good, completion and Undo worked.
- Android emulator: sign-in, lightweight deck list, content-window prompt,
  reveal, Good, and Undo worked. Due counts changed after rating and returned
  after Undo. Opening Settings backgrounded the app; returning through Expo Go opened its
  project list, so an uninterrupted project-resume path was not verified. The
  project was reopened successfully over the forwarded loopback URL. Expo's
  CLI connection warning appeared and was dismissed; opening the LAN project
  URL failed. The Android private-image preview change compiled, but its final
  on-screen image check was not completed because of that Metro transport
  failure. Web image rendering and the authenticated preview endpoint were
  verified. No background request-volume or battery measurement is claimed.

Screenshots: `image-original-zoom.png`, `stats.png`, `android-review.png`.

## Validation and limits

`pnpm check`, the web production build, and Android/iOS bundle export were run.
The build retained the existing CSS sourcemap warning; Expo emitted color-env
warnings. No physical iOS/Android device, production load, browser p75 vitals,
or long-duration battery measurements were available.

The editor already preloads during idle time and remains split from route code;
no additional editor-loading mechanism was added. Its measured client chunk
stayed approximately 799 kB raw / 255 kB gzip. Filtered Browse substring search,
per-card summary rebuilds (at most 60 siblings), and exact library revisions
were retained: the audit identified those as conditional profiling candidates,
not demonstrated bottlenecks warranting semantic or architectural changes.
