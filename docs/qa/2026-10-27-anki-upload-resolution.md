# Local authenticated upload resolution — 2026-10-27

The parent completed this investigation in the task worktree after the
original-package testing report. This is a local Convex/runtime result, not
evidence of a production outage or a production deployment.

## Reproduction and configuration check

With the static-key source changes present, but before running the updated
setup, `pnpm exec convex env list --names-only` in `packages/backend` showed
`BETTER_AUTH_SECRET`, `MOBILE_TRUSTED_ORIGINS`, and `SITE_URL`, with no `JWKS`.
Thus the latest failed test in the original-package report did not exercise
the provisioned static-key configuration. A fresh demo sign-in succeeded;
`DIRECT=1 python /tmp/anki-upload-diagnosis/loop.py 80` then failed on its
first four-upload batch after eight seconds. All four uploads and the web
check timed out. The backend logged disconnected requests to its own
`/api/auth/convex/jwks` endpoint. The API version, unknown HTTP route, JWKS
route, and web root responded again in the subsequent health probe.

The ranked explanations were recursive key fetching, shared-counter
contention, and local request/runtime handling. Removing the recursive HTTP
dependency while retaining normal storage and counter mutations distinguishes
the first explanation from the other two. The observations support the
dynamic local JWKS path as the trigger; they do not identify the exact internal
scheduler or connection-pool implementation responsible for the stall.

## Fix and verification

`pnpm worktree:setup` completed successfully, kept the existing four-card sample
library, and provisioned `JWKS` from this deployment's existing Better Auth
signing keys. After restarting `pnpm dev`, the names-only environment query
confirmed that `JWKS` was present. Both the Better Auth plugin and Convex auth
provider receive the same value. Convex embeds only its public key set in the
verification configuration; private signing material stays in the deployment
variable. When that variable is absent, the existing dynamic configuration is
used. Setup rejects cloud deployments as before.

The temporary HTTP probe was strengthened to generate distinct PNG bytes per
run using a random nonce, so this verification exercised new uploads and
counter writes rather than only previously stored duplicates. With the same
four-way concurrency and eight-second request timeout,
`DIRECT=1 python /tmp/anki-upload-diagnosis/loop.py 320` passed all 80 batches:
320 successful image responses, 80 HTTP 200 web-root checks, 55.36 seconds.
The same probe through the web's `/media/upload` route passed 80 further
uploads and 20 simultaneous web-root checks in 18.98 seconds.
The importer retains its original concurrency of four; the earlier reduction
to two is not included in the final change.

`pnpm check`, the web production build, and Android/iOS bundle checks passed
after the implementation and documentation changes. The web build still emits
the CSS sourcemap warning. Temporary probes, sessions, signing keys, and source
decks are not committed. Real-package walkthroughs and remaining coverage
limits are recorded separately in the original-package report.

## Integration with current master

The branch was merged with `origin/master` at `c323d55`. The new summary-backed
Browse requires import mutations to use `convex/functions.ts`, so imported
cards and schedules now update their summaries and deck counters in the same
transaction. Library Browse merges existing-deck summary indexes, including
the added deck-name sort index, so deleted-deck summaries never appear or
consume its read budget while bounded cleanup runs. Filtered totals likewise
read existing-deck summaries. Account cleanup includes both the import records
and the new summary/counter tables. The local sample library's summaries were
backfilled with the existing operator migration.

After resolving the merge, `pnpm check` passed with 0 errors and 60 warnings.
