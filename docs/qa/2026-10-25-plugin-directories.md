# Plugin directory packages, 2026-10-25

Scope: the `plugins/armin` package for Anthropic's and OpenAI's plugin
directories, the backend changes directory review needs, and the Settings
split between chat apps (plugin) and coding agents (MCP). Nothing was submitted
to either directory and nothing was deployed to production.

## Package checks

- `claude plugin validate ./plugins/armin` (Claude Code 2.1.310): passed with no
  findings. Validating the repository root also passed for
  `.claude-plugin/marketplace.json`.
- `plugin.json` and `mcp.json` validate against the Agent Plugins 1.0.0 JSON
  schemas (Ajv, draft 2020-12). Listing text is within OpenAI's limits: display
  name 5, short description 29, long description 898 characters; starter
  prompts at most 60 characters.
- `pnpm plugin:package` confirms the two manifests agree and the two skill
  copies are identical, and writes a 10-file ZIP with only OpenAI's files.
- `skills add <checkout> --list` finds one `writing-study-cards` skill, so the
  bundled copy doesn't duplicate the README's install instructions.

## Installs in real clients

Both installs used throwaway configuration directories (`CODEX_HOME` and
`CLAUDE_CONFIG_DIR` under `/tmp`), removed afterwards.

- Codex CLI 0.164.0: `codex plugin marketplace add <checkout>` found
  `.agents/plugins/marketplace.json`; `codex plugin add armin@armin` installed
  version 1.0.0. `codex mcp list` showed the plugin's `armin` server at the
  production URL, enabled, not logged in.
- Claude Code 2.1.310: `claude plugin marketplace add <checkout>` and
  `claude plugin install armin@armin` installed version 1.0.0. `claude mcp list`
  showed `plugin:armin:armin` at the production URL needing authentication.

The installs were not signed in, and Claude/ChatGPT web uploads were not tried.
Directory listing, review, and chat-app installs from the directories remain
untested until the submissions are approved.

## Backend, against the worktree's local deployment

- `/.well-known/openai-apps-challenge` returned 404 with no token, 200
  `text/plain` with the exact token after setting `OPENAI_APPS_CHALLENGE`, and
  404 again after removing it.
- A loopback OAuth client registered, was approved on the consent page with
  default creation-only access, exchanged the code, and listed the tools. All
  nine report a title, and the annotations are unchanged (three read-only; only
  `save_cards` is a non-destructive write).
- The `save_cards` cloze schema and the server instructions now teach
  `{{1::answer}}`. Before this change they taught `{{c1::answer}}`, which the
  core parser reads as answer `c1` with the real answer as its hint, so
  agent-written cloze cards had wrong answers.

## Settings walkthrough

Chromium through agent-browser, at 1280×1400, signed in as the sample account.

- Claude ([screenshot](2026-10-25-plugin-directories/claude-pending.png)):
  "Pick your assistant", then "Add Armin" with a notice that the plugin is
  waiting for directory review, the address, and custom connector steps. The
  local-address warning still appears because the dev server isn't public.
- Codex ([screenshot](2026-10-25-plugin-directories/codex.png)): address and
  both `codex mcp` commands, unchanged from before.
- ChatGPT once listed ([screenshot](2026-10-25-plugin-directories/chatgpt-listed.png)):
  with `directory.listed` temporarily set to `true` and then restored,
  "Add the Armin plugin" shows directory steps and an "Open ChatGPT's plugins"
  link to `https://chatgpt.com/plugins`, with no address.

## Validation

`pnpm check` (0 errors; 59 existing warnings, none in changed files),
`pnpm --filter @armin/web build`, and `pnpm --filter @armin/mobile check:bundle`
pass.
