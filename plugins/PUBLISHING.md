# Publishing the Armin plugin

`plugins/armin` is one plugin folder that both plugin directories read:

- **Anthropic's plugin directory** lists it in Claude (web, desktop, and mobile
  chat), Cowork, and Claude Code.
- **OpenAI's plugin directory** is shared by ChatGPT and Codex, so one listing
  covers both.

Each directory has its own manifest. The skill, icon, README, and license are
shared.

| File                                | Read by   | Purpose                                                                                    |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `armin/.claude-plugin/plugin.json`  | Anthropic | Identity and listing fields (icon, privacy, terms, support URLs).                          |
| `armin/.mcp.json`                   | Anthropic | Armin's production MCP server, `type: "http"`.                                             |
| `armin/plugin.json`                 | OpenAI    | Portable Agent Plugins manifest. Listing and review cases live in `extensions.com.openai`. |
| `armin/mcp.json`                    | OpenAI    | The same server, `type: "streamable-http"`. Sign-in uses OAuth discovery and DCR.          |
| `armin/skills/writing-study-cards/` | Both      | Card-writing guidance. Must match `.agents/skills/writing-study-cards/`.                   |
| `armin/assets/logo.png`             | Both      | 512×512 listing icon, from the mobile app icon.                                            |
| `.claude-plugin/marketplace.json`   | Claude    | Lets Claude Code and claude.ai install the plugin straight from this repository.           |
| `.agents/plugins/marketplace.json`  | Codex     | Lets Codex install the plugin straight from this repository.                               |

The plugin adds no hooks, scripts, or local servers. Everything it does goes
through the hosted MCP server, so server changes reach users without a new
plugin version.

## Before submitting to either directory

These block review and are not done yet:

1. **Deploy the web app** so `https://armincards.app/privacy` and
   `https://armincards.app/terms` are live. Both directories link to them, and
   OpenAI requires both for a plugin with an MCP server.
2. **Deploy this branch's backend to production.** It adds a `title` to every
   tool (Anthropic's directory flags tools without one) and the OpenAI domain
   verification route. It also fixes the cloze syntax the tools teach.
3. **Enable and verify the reviewer reset in production** after deploying the
   backend, following the [backend instructions](../packages/backend/README.md#public-reviewer-account).
   The public login is `reviewer@armincards.app` / `ArminDemo123!`. Both
   directories can use it without MFA or email codes. Tell reviewers that the
   shared library is visible to everyone and resets roughly every six hours;
   they must not add private material.
4. **Record a short demo video** of the five positive review cases in
   `armin/plugin.json` and host it where OpenAI's reviewers can open it. Add
   its URL as `review.demo_recording_url` in `armin/plugin.json`.

The manifests point at the Convex address
`https://intent-bullfrog-922.convex.site/mcp`, and that is the published
address. OpenAI changes a published plugin's MCP URL only through its support.
The server uses `CONVEX_SITE_URL` as its OAuth issuer and token audience, so a
new address would also need backend changes and new URLs in both MCP files.

Run `pnpm plugin:package` after any change. It checks that the two manifests
agree on name, version, description, license, and server URL, and that the two
skill copies are identical, then writes the OpenAI upload to
`dist/plugins/armin-<version>-openai.zip`. Run
`claude plugin validate ./plugins/armin` for Anthropic's local checks.

## Submit to Anthropic's directory

Anthropic lists the plugin and the MCP server as two linked submissions, both
from the developer portal at [claude.ai/directory/manage](https://claude.ai/directory/manage).
Any paid Claude plan can submit.

1. Connect your GitHub account on claude.ai.
2. **Submit new → MCP connector** with
   `https://intent-bullfrog-922.convex.site/mcp`. Choose OAuth with dynamic
   client registration, add the icon, documentation URL
   (`plugins/armin/README.md` on GitHub), privacy policy, support link
   (GitHub Issues), and the reviewer account. The tools sync from the server;
   confirm each shows its title and read-only or write label.
3. **Submit new → Plugin bundle**, repository `andy-spike/armin`, plugin path
   `plugins/armin`, tracking `master`. Select **Validate**, fix any blocking
   finding, answer the data-handling questions (the plugin sends card content
   only to Armin's own server), then submit. Pair it with the connector listing.
4. After approval, publish it from the portal. New commits to `master` that
   change `plugins/armin` are scanned and published as new versions; raise
   `version` in both manifests each release.

See Anthropic's [plugin submission guide](https://claude.com/docs/plugins/submit)
and [connector submission guide](https://claude.com/docs/connectors/building/submission).

## Submit to OpenAI's directory

1. In the OpenAI platform organization that will own the plugin, complete
   individual or business verification and make sure you have **Apps
   Management** write access.
2. Run `pnpm plugin:package`.
3. Open [platform.openai.com/plugins](https://platform.openai.com/plugins),
   choose **Upload new or existing plugin**, pick the developer identity, and
   upload the ZIP. Fix any findings under **Metadata & Skills** and upload again.
4. Under **MCPs**, select **Connect** on `armin`. The portal shows a domain
   verification token. Set it on production and confirm it is served:

   ```bash
   cd packages/backend
   npx convex env set OPENAI_APPS_CHALLENGE <token> --prod
   curl https://intent-bullfrog-922.convex.site/.well-known/openai-apps-challenge
   ```

   Then connect, sign in to Armin with the reviewer account, approve the
   connection, and wait for the tool scan.

5. Under **Review details**, enter the reviewer account. The five positive and
   three negative test cases import from `plugin.json`.
6. Submit for review. After approval, choose **Publish plugin**.

OpenAI rescans the MCP server daily, so tool changes go live without a new
ZIP. Changes to the listing text, icon, or skill need a new version and upload.

See OpenAI's [submission guide](https://developers.openai.com/plugins/deploy/submission)
and [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

Optional for OpenAI: ChatGPT Enterprise workspaces can restrict plugins by
verified email domain only when the OAuth server offers OpenID Connect with an
`email` claim. Armin does not implement OpenID Connect, so that restriction is
unavailable; the plugin still works without it.

## After a listing goes live

In `apps/web/src/components/agent-settings.tsx`, set `directory.listed` to
`true` for the client whose listing went live. Settings → AI assistants then
sends Claude or ChatGPT users to the plugin directory instead of the custom
connector steps. Coding agents keep connecting with the MCP commands.
