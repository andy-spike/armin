# Dependency patches

`@tanstack__start-server-core.patch` handles incoming request cancellation in
TanStack Start 1.169.44. Browser tabs reconnecting during dev startup can cancel
requests, producing a misleading aborted/ECONNRESET stack trace.

The patch skips logging only for a cancelled incoming request and its cancellation
error. Upstream connection failures and unrelated application errors still log.
It changes shipped JavaScript and source TypeScript. pnpm reapplies it through
`patchedDependencies` in `pnpm-workspace.yaml`.

Reevaluate this patch when upgrading TanStack Start. See
`docs/qa/2026-10-20-dev-startup.md` for reproduction and verification.
