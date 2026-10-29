# Performance attempt ledger

2026-10-29 — local anonymous deployment, synthetic data, no production claims.
Detailed method, raw samples, and correctness evidence:
[QA report](../qa/2026-10-29-performance/report.md).

| Attempt                                                                         | Evidence                                                                                                                     | Verdict                                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Daily activity and compact unit projections for Stats                           | Estimated JSON read volume 1,477,336 → 81,933 bytes; same totals/retention in all five paired samples                        | Kept                                                                    |
| Compact review queue plus eight-item content window                             | Queue payload 647,024 → 6,564 bytes before final descriptor cleanup; IDs/order unchanged; first-window request is additional | Kept; no end-to-end first-prompt latency claim                          |
| Cram's latest-Again boundary projection                                         | 522 → 22 read rows; identical membership across all five samples                                                             | Kept                                                                    |
| Counter-based navigation with shared per-deck admission counts                  | Removes per-deck DB scans from sidebar deck list; running-app counts checked against review behavior                         | Kept with shared compact selection; no production latency claim         |
| Mobile due-event clock                                                          | Removes the fixed 30-second argument-update interval; Android reveal/rate/undo walkthrough passed                            | Kept; no measured battery savings or uninterrupted project-resume claim |
| Private image preview                                                           | Synthetic PNG 8,416,349 → 688,670 display bytes; original retained for zoom; unauthorized preview returned 401               | Kept                                                                    |
| Additional editor preload                                                       | Existing wrapper already preloads on idle; editor remains ~255 kB gzip                                                       | No additional mechanism added                                           |
| Browse search indexes / sharding exact revision / incremental sibling summaries | No runtime evidence justifying changes to semantics or atomicity; sibling count capped at 60                                 | Deferred pending profiling                                              |

Database byte estimates count JSON representations observed by an instrumentation
wrapper, not Convex transaction/billing bytes. The five-sample local medians are
recorded for context, not treated as production latency targets. Re-measure under
representative production data and device/network conditions before making a
user-experience speedup claim.
