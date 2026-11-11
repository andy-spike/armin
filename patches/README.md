# Dependency patches

pnpm applies both patches through `patchedDependencies` in `pnpm-workspace.yaml`.

- `@convex-dev__mcp@0.1.0-alpha.7.patch` adds an optional `inputSchema` to `ToolDefinition` in `@convex-dev/mcp`. The component otherwise publishes only JSON Schema derived from Convex validators, which can't carry descriptions or limits. Armin publishes JSON Schema generated from its Zod tool schemas instead; runtime validation still uses the Convex validators.
- `@tanstack__start-server-core.patch` stops `@tanstack/start-server-core` from logging cancelled incoming requests. Browser tabs reconnecting during dev startup cancel requests, which produced a misleading aborted/ECONNRESET stack trace. Other errors still log. Reevaluate it when upgrading TanStack Start.
