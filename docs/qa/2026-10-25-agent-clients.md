# Claude Code and Codex client walkthrough, 2026-10-25

## Environment

Tested PR #48 after merging current `master`, at commit `8758741`, using the
worktree's isolated local Convex deployment and sample account. Started the app
with `pnpm dev`. The web origin was
`http://armin-a054a464ca.localhost:39712`; MCP used
`http://127.0.0.1:39715/mcp`. No production deployment or data was used.

These were actual installed CLI clients making model-driven MCP calls, rather
than SDK simulations. Codex used an isolated `CODEX_HOME` under ignored
`.armin/`; Claude Code used a temporary local server configuration scoped to
`/tmp`. No repository MCP configuration or default model was changed.

## Passed checks

- Codex dynamically registered its client, opened Armin's OAuth consent page,
  and completed S256 PKCE login through its actual loopback callback.
- Claude Code dynamically registered its client and completed the same flow
  through its own loopback callback. Its login command required an interactive
  terminal; rerunning with a PTY completed successfully.
- Both consent flows kept the creation-only defaults. Each client's first
  `list_decks` call returned no decks, despite the sample account already having
  decks and despite Codex having created a deck before Claude's test.
- Codex, using `gpt-6-luna` at low reasoning effort, created
  `Codex Luna QA 2026-10-25`: three basic HTTP cards and two prerequisite links.
  `read_deck` and `read_prerequisites` returned the saved content successfully.
- Claude Code, using `claude-haiku-5-5`, created
  `Claude Haiku QA 2026-10-25`: three basic HTTP cards and a two-edge prerequisite
  chain. It read back all three cards and both links without errors. The CLI
  reported approximately $0.0035 at list prices, with a $0.50 execution cap.
- Opened both returned deck URLs in the running web app. Each showed the three
  cards; foundational cards were new and dependent cards were locked.
- Settings displayed both connections and their authoring activity. Revoked only
  the two new QA connections through the UI. Claude Code's connection health
  check then reported `Needs authentication`. Codex's subsequent MCP startup
  received the server's `AuthRequired` challenge and could not initialize.

The shared browser completed Codex consent but later timed out twice while
inspecting Claude consent. Switched to a dedicated `agent-browser` session,
signed in normally, and completed Claude consent, deck inspection, and
revocation. This browser-tool timeout did not reproduce in `agent-browser`.

## Remaining acceptance checks

ChatGPT and Claude chat have not been tested. They require public HTTPS access;
these local CLI results do not establish hosted-client compatibility. Natural
access-token expiry and refresh were not exercised in these short CLI sessions;
the earlier SDK walkthrough covers refresh rotation and reuse rejection.

No code fix was needed. The QA decks remain in the local sample account for
inspection; the new connections were revoked and temporary client registrations
were removed from the CLI configurations after testing.
