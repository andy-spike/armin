# MCP component migration verification

Date: 2026-10-28. Local worktree deployment only. No production deployment.

## Implementation and review

Two DeepSeek V4.1 Flash delegates (max variant) implemented backend and
frontend/documentation changes. The parent reviewed their combined changes,
including component grant checks, ownership checks, consent, disconnection,
legacy schema compatibility, and authoring changes.

Parent corrections:

- Removed the estimated consent deadline from the API and UI. The component
  does not expose the actual request deadline; approval still checks expiry.
- Restored a streaming 1 MiB bound before MCP tool JSON parsing. OAuth routes
  retain component/platform bounds.
- Changed first-tool connection admission to count live app-linked grants in
  the same mutation. Concurrent approvals may create surplus component grants,
  but cannot admit more than twenty tool connections. Existing admitted
  connections remain usable. Counting uses bounded component results and
  indexed lookups, without an unbounded app table scan.
- Corrected OAuth endpoint documentation to `/mcp/oauth/*`.
- Shortened consent copy to describe access and tool limits.

## Parent verification

- `pnpm check`: passed; formatting, lint, and typecheck.
- `pnpm --filter @armin/web build`: passed, with bundle-size and CSS sourcemap
  warnings.
- `pnpm --filter @armin/mobile check:bundle`: passed for iOS and Android.
- `git diff --check`: passed.
- Local OAuth probe: registration, redirect authorization, app approval,
  authorization-code exchange, tool discovery, all nine tool calls, same-input
  retry, changed-input retry rejection, stale-version rejection, cycle rejection,
  and credential rejection after revocation. Executed as temporary operator
  scripts outside the repo; no automated test suite was added.
- Oversized MCP request (1,048,577 bytes): HTTP 413 from the app guard.
- Named agent-browser Chromium session against
  `http://armin-72b5385223.localhost:19984`: signed in with the sample account,
  opened AI assistants settings and a real pending OAuth consent request,
  checked the whole-library access text and absence of permission controls,
  clicked Deny, returned to settings, opened Disconnect for an approved but
  unused connection, confirmed it, and observed “Assistant disconnected”.
  The test OAuth callback had no listening client; its browser navigation is
  not evidence of an actual agent session.

Screenshots: [consent](2026-10-28-mcp-component/consent.png) and
[settings](2026-10-28-mcp-component/settings.png). These are desktop Chromium
screenshots, not a real mobile device walkthrough.

The backend delegate additionally reported local refresh, two-connection
access, connection-limit and legacy-retirement probes. These are delegate
results; the parent did not independently repeat every one. Some exploratory
history/move probes failed earlier input/version validation, so those failures
alone do not establish review-history or linked-move protection. The existing
protection paths remain in the authoring code.

## Remaining release checks

Actual Claude Code, Codex, ChatGPT, and Claude sessions have not been repeated
with this implementation. Local HTTP probes are not equivalent to those
clients. Hosted clients need a reachable HTTPS staging deployment. Natural
expiry, refresh-replay races, account deletion during an in-flight operation,
and concurrent approval/admission at the limit were inspected in source but
not independently reproduced by the parent.

Before production: complete those client/lifecycle checks, deploy the backend
and web together, require old connections to reconnect, and run the documented
bounded `agents:retireLegacyConnections` migration on the intended deployment.
Keep legacy schema/provenance records for rollback. Resend is unchanged.
