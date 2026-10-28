# MCP component migration assessment

Date: 2026-10-28. Revised after the one-access decision. Scope: adopt the
Convex MCP component for Armin's hosted server; Resend stays unchanged.

## Decision

Adopt the inspected `@convex-dev/mcp@0.1.0-alpha.7` release for OAuth, token
handling, and MCP transport, while keeping Armin's nine tools, tool behavior,
connection records, activity, quotas, and study-data protections. Pin the exact
inspected artifact rather than a moving tag.

This supersedes the earlier conditional recommendation in the
[component source review](mcp-component-source-review.md). That review found
that the component creates its grant during token exchange, after consent, and
offers no supported way to attach Armin's per-deck permissions to the future
connection ID. The product no longer has per-deck permissions, so there is no
consent-time permission payload to bind. The simplified model removes the
blocker; no component API change or client-name matching is involved.

This document records the design and source-level changes. It does not claim
runtime compatibility, and it does not replace the running evidence listed
below.

## One access level

- Consent presents one access statement and two actions: approve or deny. It has
  no deck selection, read-only sharing, deck-creation, or edit toggles.
- Settings lists connected assistants, their last use, recent activity, and a
  Disconnect action. It has no permission editor.
- Every approved connection can use all nine tools on the whole active library:
  every deck and card, including decks and cards added later.
- Agents cannot permanently delete cards or decks, upload images, rate reviews,
  change scheduling, export a library, or administer accounts. Archiving is
  reversible. Each connection is limited to 120 successful authoring writes per
  hour; an account may have 20 active connections.
- Each approval still creates a distinct connection. A connection identifier
  supplied by an external caller is never trusted; the authenticated connection
  and its active app record are resolved server-side.

## Implementation shape

The web app keeps the `/connect-agent?request=...` consent route. The fixed
client contract is:

- `api.agents.connections` returns
  `{connections: [{_id, name, createdAt, lastUsedAt?, revokedAt?}], activity}`.
- `api.agents.authorization({requestId})` returns
  `{clientName, redirectOrigin} | null`.
- `api.agents.approve({requestId})` returns `{redirectUrl}`.
- `api.agents.deny({requestId})` returns `{redirectUrl}`.
- `api.agents.revoke({connectionId})` returns `null`.

The component owns OAuth authorization, token exchange, refresh rotation, and
MCP transport. Armin keeps `agentConnections` as the application record used for
the settings list, activity attribution, authoring quotas, provenance, and
disconnecting the assistant. A freshly approved grant is listed before first
use; Armin creates its app record on the first tool call. Disconnect accepts
either record id. Study content keeps its existing document IDs; the migration
does not replace them with component IDs or rewrite authored content.

The consent page names the unverified client and its callback origin, then
explains that approval gives the assistant all nine tools on the whole library.
Disconnect ends the app grant immediately; saved cards and decks remain. The
activity list and its 90-day summaries are unchanged. Resend integration is
unchanged.

## Contracts preserved

Sources: `packages/backend/convex/{agentHttp,agents,agentAuthoring}.ts`,
`model/agentAuth.ts`, `schema.ts`, `deletion.ts`, and
[agent connections](../agent-connections.md).

- Nine tools retain names, arguments, responses, annotations, and writing
  instructions.
- Agent authentication remains separate from first-party sessions. The
  authenticated consenting user must have a writable, verified, active library.
- Every read or write checks its active app connection and library ownership
  inside the data operation.
- Review history stays protected, including optimistic version checks, atomic
  batch writes, request fingerprints, seven-day idempotency, hourly write
  limits, and activity retention.
- The twenty-active-connection cap and immediate denial after disconnect or
  account deletion remain requirements.
- Hosted `/mcp`, plugin metadata, domain verification, supported client setup,
  origin restrictions, and bounded request handling remain in place.

## Historical source-review findings

The companion [component source review](mcp-component-source-review.md) remains
the record of source inspection of the alpha release. Its recommendation to
defer production replacement until connection-to-permission binding was solved
is **superseded** by the one-access model. Its observations and remaining
technical risks still apply:

- The npm `latest` and `alpha` tags are both prereleases. Pin the inspected
  version and recheck metadata when implementing.
- Authentication happens before tool execution, and the inspected release has
  no focused active-grant query. Armin must still check its app connection inside
  each data operation; cross-component transaction behavior needs validation.
- Component revocation deletes its grant, but Armin must also deny tools
  immediately after an app-level Disconnect and schedule bounded cleanup for
  account deletion.
- No legacy credential import path was found. Plan a deliberate reconnect
  cutover rather than promising token continuity.
- Component OAuth limits differ from Armin's existing HTTP limits. Keep Armin's
  write and connection limits and verify request-size and CORS behavior.
- Device authorization must stay disabled, and API-key creation must stay
  unexported.

## Verification needed

No new automated test suites, per repository policy. Use temporary
operator/SDK probes and documented running-app walkthroughs.

- Run `pnpm check`, `pnpm --filter @armin/web build`, and
  `pnpm --filter @armin/mobile check:bundle` for implementation changes.
- Walk through consent approval, denial, expiry, duplicate approval, return
  redirects, whole-library access, Disconnect, activity, and account deletion.
- Probe revoked connections, inactive libraries, wrong resource audiences,
  expired access tokens, refresh rotation and replay, and a request
  authenticated before disconnect whose mutation starts afterward.
- Verify all nine tools, tool discovery and instructions, malformed or oversized
  requests, origins, retries, changed-input retries, stale edits, prerequisite
  cycles, quotas, history protection, and atomic rollback.
- Verify twenty-connection enforcement and every enabled authorization path.
  Component failure must not leave a usable connection without an approved app
  record.
- Use actual Claude Code and Codex clients locally; use a public staging
  deployment for actual ChatGPT and Claude hosted-client OAuth, tools,
  reconnect, disconnect, and refresh. A local SDK probe is not evidence of
  hosted-client compatibility.

Go only if these checks preserve the documented behavior and the integration
removes substantial protocol code without replacing it with equally complex
adapters. Defer if component limitations require a fork or an unproven
disconnect model.

## Cutover and rollback

Default to reconnecting instead of importing credentials. Inventory active
connections before deployment without exporting secrets. Explain that decks
remain intact and that old connections must be approved again; the new
connection receives whole-library access only after the user approves it.

Keep the old schema and implementation available for the rollback window, but
mount only one implementation at each public endpoint. Reverting code must not
resurrect invalidated credentials or app records. If necessary, require fresh
authorization after rollback. Do not delete component data or legacy
connection/provenance rows during the rollback window.

## Evidence limits

The local implementation and parent verification are recorded in
[the migration walkthrough](../qa/2026-10-28-mcp-component.md). Actual hosted
ChatGPT/Claude and coding-agent sessions have not been repeated after migration.
No production deployment has been performed.
