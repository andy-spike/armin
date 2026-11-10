# Dependency patches

`@convex-dev__mcp@0.1.0-alpha.7.patch` adds an optional `inputSchema` to
`ToolDefinition` in `@convex-dev/mcp` 0.1.0-alpha.7. The component otherwise
publishes only the JSON Schema derived from Convex validators, which cannot
carry descriptions or limits. Armin publishes JSON Schema generated from its
Zod tool schemas instead; runtime validation still uses the Convex validators.
The patch changes shipped JavaScript, declarations, and source TypeScript.

`@tanstack__start-server-core.patch` handles incoming request cancellation in
TanStack Start 1.169.44. Browser tabs reconnecting during dev startup can cancel
requests, producing a misleading aborted/ECONNRESET stack trace.

The patch skips logging only for a cancelled incoming request and its cancellation
error. Upstream connection failures and unrelated application errors still log.
It changes shipped JavaScript and source TypeScript. pnpm reapplies it through
`patchedDependencies` in `pnpm-workspace.yaml`.

Reevaluate this patch when upgrading TanStack Start.
