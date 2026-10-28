# Cloudflare Container Anki benchmark: blocked hosted checkpoint

2026-10-28. **Result: partial; hosted feasibility remains unproven.** This is a research checkpoint, not an importer migration. No hosted Container was started. The authenticated account's `pnpm exec wrangler containers list` returned: “You do not have access to Cloudflare Containers. Deploying containers requires the Workers Paid plan.” `wrangler r2 bucket list` succeeded, but no benchmark bucket was created: it could not unblock the actual Container test. The local Docker daemon also returned permission denied. No production Worker, domain, Convex deployment, existing bucket, or data was changed. No temporary cloud resources or cloud data were created, so none require cleanup.

The next required step is enabling Workers Paid / Container access on the authorized account, and providing a usable Docker daemon or another supported image-building route. Re-run the hosted experiment after access is enabled; do not infer a pass from the controls below. The real AnKing archive was not found in the benchmark fixture directory; its prior result exists, but rerunning it needs the user's existing local archive, without downloading or committing copyrighted content.

## Local controls

The existing real web reader and converter were run in fresh standalone Node processes using the previous synthetic fixtures. Full JSON `ImportPlan` SHA-256 digests matched the prior standalone controls in all five cases. Timing starts after the archive is read into a Blob, and RSS is process lifetime peak, including that read. These are local desktop measurements, not Container timings or resource-limit evidence. The media case reads the collection and media names for preview, not all image bytes or a complete import.

| Fixture                      | Total parse and conversion |  Peak RSS | Digest parity |
| ---------------------------- | -------------------------: | --------: | ------------- |
| 2k cards / 10k logs          |                     314 ms |   199 MiB | match         |
| max content                  |                   1,017 ms |   511 MiB | match         |
| media-heavy, ~96 MiB archive |                     223 ms |   363 MiB | match         |
| highly compressed            |                   3,432 ms | 1,208 MiB | match         |
| 2k text export               |                      82 ms |   125 MiB | match         |

Reproduce with `node docs/research/cloudflare-anki-import-bench/local-controls.mjs` after preparing fixtures and baseline records using [the existing harness](anki-import-bench/README.md). Outputs go under ignored `.armin/anki-bench/results/`. Existing measurements and fixture provenance are in [the Convex benchmark](convex-anki-import-benchmark.md). These local controls compare the same reader across runs; they do not establish parity with a Container implementation.

## Platform envelope and indicative costs

Cloudflare documents `standard-1` as 1/2 vCPU, 4 GiB RAM and 8 GB disk. Containers require Workers Paid, advertised at $5/month; active containers are billed in 10 ms increments. After included monthly usage, provisioned memory is $0.0000025/GiB-second, disk $0.00000007/GB-second, and active CPU $0.000020/vCPU-second. The plan includes 25 GiB-hours, 200 GB-hours and 375 vCPU-minutes monthly. Memory and disk accrue during idle while the container is running; charges stop on sleep. [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/).

For illustration only, one 60-second running `standard-1` instance with 30 vCPU-seconds of actual CPU costs approximately $0.001234 in marginal resource rates before included usage: $0.000600 memory + $0.0000336 disk + $0.000600 CPU. Each additional idle minute while still running adds $0.0006336 in memory and disk, plus any actual CPU. This is not a measured bill and excludes the paid plan, Workers and Durable Objects charges, R2, and taxes. Actual CPU, startup and sleep behavior must be measured.

[Standard R2 pricing](https://developers.cloudflare.com/r2/pricing/) lists $0.015/GB-month, $4.50/million Class A and $0.36/million Class B operations, with monthly included usage and billing-unit rounding; egress is free. Worker requests and Durable Objects have separate charges. R2's [single PUT and multipart limits](https://developers.cloudflare.com/r2/objects/upload-objects/) are 5 GiB and 5 TiB respectively, with 5 MiB–5 GiB multipart parts and up to 10,000 parts. The [Workers request body limit](https://developers.cloudflare.com/workers/platform/limits/) depends on the Cloudflare account plan: 100 MB on Free/Pro and 200 MB on Business. A direct R2 upload design and any proxy path must be verified separately; neither resumability nor user-network performance was measured here.

## Remaining proof

Build a gated, authenticated benchmark Worker and bounded one-job-per-container prototype, with maximum one instance and short sleep timeout; use a dedicated private R2 bucket and random access secret. Stage the existing inputs, including AnKing when available. Measure hosted cold/warm startup, R2 fetch, parse and conversion, Node RSS/heap/external, container memory, and full-plan digest parity against the existing importer. Measure extraction and validation of actual image bytes separately from preview. Persist artifacts under stable IDs, stop and restart the container, and test retries and artifact retrieval. Capture running and idle duration and actual CPU for cost estimates. Clean up the Worker, Container application, bucket and objects, and verify removal even after errors. Do not claim Workflow cancellation, safe saves, or product import until independently exercised. Limits for decompressed data and upload still need explicit design and adversarial validation.
