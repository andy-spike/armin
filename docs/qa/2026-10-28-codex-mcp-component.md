# Actual Codex client verification after MCP migration

Date: 2026-10-28. Codex CLI 0.165.0, local worktree deployment only.

## Method

Started the app with root `pnpm dev`. Used an isolated Codex home under ignored
`.armin/codex-mcp-qa`, with the installed client's existing authentication.
The normal Codex configuration was not changed. Added `armin-local` pointing at
`http://127.0.0.1:19987/mcp` using `codex mcp add`.

Completed the actual client's OAuth registration and PKCE flow through a named
agent-browser Chromium session: signed into the sample account, approved the
whole-library consent, and returned to Codex's real loopback callback. The CLI
reported `Successfully logged in`.

Ran `codex exec --ephemeral --json` from `/tmp`. This was an actual model-driven
Codex run, not an SDK simulation. Its event log recorded successful calls to:

- `list_decks`: returned the sample library and an existing probe deck.
- `save_cards`: created `Codex component verification 2026-10-28`, two basic
  HTTP cards, and one prerequisite.
- `read_prerequisites`: read back the prerequisite.
- `read_deck`: read back the two cards.

The deck ID is `kh7cned19jhv46m4hgv9bharv58h5z89`. It remains in the local
sample account for inspection. No production data was used or changed.

## Disconnection

Opened Settings → AI assistants in the browser. Disconnected only this new
Codex connection and confirmed the dialog. Started another isolated Codex run.
Its MCP transport failed authentication during startup with `AuthRequired` and
`invalid_token`; the server was consequently unavailable for a tool call.
Thus the disconnected credentials could not initialize the MCP connection.

Removed the temporary client's MCP registration and local copied authentication
file afterward; closed the task browser and stopped the development launcher.

## Scope

OAuth login, model-driven reading/writing, whole-library access, and revoked
credential rejection passed with the actual installed Codex client. No code fix
was needed. Natural token expiry and refresh were not exercised. This result
does not establish Claude Code or hosted ChatGPT/Claude compatibility.
