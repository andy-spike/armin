# Convex MCP component source review

Reviewed 2026-10-28 for Armin. This is source inspection, not a running-deployment compatibility result. At review time, no application dependency was installed or changed. The published `@convex-dev/mcp@0.1.0-alpha.7` tarball was extracted outside the repository.

> **Historical note.** This review records the source inspection that preceded the
> simplified access decision. Its recommendation to defer replacement until
> connection-to-permission binding is solved is **superseded** by the one-access
> model in [the migration assessment](mcp-component-migration.md). The product no
> longer binds per-deck permissions at consent. The source findings, version
> warnings, and revocation caveats below remain historical evidence; only the
> gating recommendation is withdrawn.

## Original recommendation (superseded)

Proceed with a local feasibility spike, but do not schedule production replacement until connection-to-permission binding is solved. The component removes useful OAuth and protocol maintenance, but its current convenience API does not directly preserve Armin's consent-time, per-connection permissions. An upstream extension is preferable to forking OAuth internals or weakening consent.

## Release maturity

The npm registry currently marks `latest` as `0.1.0-alpha.0` and `alpha` as `0.1.0-alpha.7`. There is no stable release at either tag. Pin the inspected exact version during a spike; a bare package install selects an older alpha. Recheck registry metadata when implementing. [Registry metadata](https://registry.npmjs.org/@convex-dev%2fmcp), [inspected immutable tarball](https://registry.npmjs.org/@convex-dev/mcp/-/mcp-0.1.0-alpha.7.tgz).

## Identity and transaction boundaries

`McpUser` carries `userId`, `scopes`, optional `clientId`, and `connectionId`. `authenticate` verifies a bearer-token hash through `component.tokens.verify`; its returned `grantId` becomes `connectionId`. It checks the resource audience before returning identity. Tool annotations, titles, descriptions, and server instructions are supported, so Armin can retain its nine tool names and guidance. Tool definitions use Convex validators rather than Armin's current Zod registrations. [Client source](https://github.com/get-convex/mcp/blob/main/src/client/index.ts).

Authentication happens in an HTTP action before the tool's internal query/mutation. Passing the resulting identity alone does not ensure that a grant revoked between authentication and a write is rejected. Armin should retain an active-connection check inside every data operation. The component exposes `grants.list(userId)` but no direct `get`/`assertActive` grant query in the inspected release. That list returns at most 200 records. An app mutation can query that component API and require the connection to remain present, but this needs validation of cross-component transactional behavior and should be replaced by a focused upstream query if possible. Keep Armin's 20-connection bound; do not rely on a truncated list as an unlimited authorization mechanism. [Grant source](https://github.com/get-convex/mcp/blob/main/src/component/grants.ts), [token source](https://github.com/get-convex/mcp/blob/main/src/component/tokens.ts).

## Consent binding (historical blocker)

The convenience `api().authorize` is an action accepting only `requestId`, `approve`, and optional device `userCode`. It supports no application callback or permission metadata. The underlying `decideAuthRequest` records user approval but does not create a connection. The connection is created later during OAuth code exchange; `createGrant` inserts the grant and token rows, and the exchange result returns scopes without the new grant ID. Thus a wrapper around consent approval cannot directly store Armin's selected-deck permissions against the future `connectionId`.

Do not associate permissions with only `(userId, clientId)`: the same client can have multiple connections and approvals with different permissions. Do not lazily give a new unknown connection the user's most recent approved permissions. Both lose the exact relationship between consent and grant.

Preferred upstream capability: accept opaque application authorization metadata or an app authorization identifier during approval, carry it to the grant, and expose it to a trusted connection query/tool identity; alternatively provide a callback/transactional connection creation API. Include a direct active-grant query. A constrained spike can first prove create-only connections, but selected-deck and whole-library consent must remain blocked until exact binding works. [OAuth source](https://github.com/get-convex/mcp/blob/main/src/component/oauth.ts), [client API source](https://github.com/get-convex/mcp/blob/main/src/client/index.ts).

**Superseded by the one-access model.** Armin now grants one whole-library
access level, so there is no per-connection permission payload to bind at
consent. This limitation matters again only if per-deck permissions return.

## Optional features can stay off

Set `deviceFlow: false` explicitly: device flow defaults to enabled. Do not export `createApiKey` or the internal operator key helper; returning those functions from `api()` does not itself expose them as app endpoints. Keep client metadata document hosts unset unless intentionally enabled. Server instructions and tool annotations can be preserved. Scope enforcement controls tool visibility/invocation but cannot replace Armin's active-connection and library checks. [Client options and API](https://github.com/get-convex/mcp/blob/main/src/client/index.ts).

## Revocation, cleanup, and migration

Component revocation deletes its grant and bounded token rows. Verification and refresh require the grant, so subsequent authentication fails even if some token rows remain pending cleanup. Armin still needs account-deletion access denial in its library checks and eventual component-grant cleanup. The inspected API has no bulk user deletion helper; bounded connection cleanup must be planned.

No legacy token/client/grant import API was found in the inspected client or component source. Plan a deliberate reconnect cutover rather than promising credential continuity. Old Armin connection IDs are also referenced by authored content and idempotency/activity data; retain historical ownership records or explicitly map them. A fresh connection receives whole-library access only after the user approves it. [Grant source](https://github.com/get-convex/mcp/blob/main/src/component/grants.ts), [OAuth source](https://github.com/get-convex/mcp/blob/main/src/component/oauth.ts).

The component rate limits client registration, global/per-client authorization requests, device requests, and user-code lookup. These differ from the retired Armin HTTP limits. Keep Armin's 120-writes/hour limit and 20-connection cap, and inspect request-size/CORS behavior rather than assuming equivalent defaults. [Limits source](https://github.com/get-convex/mcp/blob/main/src/component/limits.ts).

## Required evidence before adoption

- Concurrent approvals by the same user and client, including listing, first-use app record creation, and Disconnect.
- Revocation and account deletion racing an already-authenticated write; check inside the committing transaction.
- Whole-library access for every approved connection, immediate denial after Disconnect, and unknown connections failing closed.
- All nine tool schemas, annotations, instructions, version conflicts, retries, atomic batch behavior, quotas, and history preservation.
- Real Claude Code/Codex OAuth, then real hosted ChatGPT/Claude OAuth, refresh rotation/reuse, expiration, and reconnection behavior.
- A reconnect communication and historical-content ownership policy, plus rollback that does not reactivate deliberately revoked old credentials.

The GitHub links above are readable source locations on a moving branch. For exact reproduction, use the immutable alpha.7 tarball cited above; conclusions here refer to its files, not future main-branch changes.
