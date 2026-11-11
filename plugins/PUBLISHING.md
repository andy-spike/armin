# Publishing the Armin plugin

`plugins/armin` is one plugin folder that both plugin directories read:

- **Anthropic's plugin directory** lists it in Claude (web, desktop, and mobile), Cowork, and Claude Code.
- **OpenAI's plugin directory** serves ChatGPT and Codex with one listing.

Each directory has its own manifest. The skill, icon, README, and license are shared.

| File                                | Read by   | Purpose                                                                           |
| ----------------------------------- | --------- | --------------------------------------------------------------------------------- |
| `armin/.claude-plugin/plugin.json`  | Anthropic | Identity and listing fields (icon, privacy, terms, support URLs).                 |
| `armin/.mcp.json`                   | Anthropic | Armin's production MCP server, `type: "http"`.                                    |
| `armin/plugin.json`                 | OpenAI    | Portable manifest. Listing and review cases live in `extensions.com.openai`.      |
| `armin/mcp.json`                    | OpenAI    | The same server, `type: "streamable-http"`. Sign-in uses OAuth discovery and DCR. |
| `armin/skills/writing-study-cards/` | Both      | Card-writing guidance. Must match `.agents/skills/writing-study-cards/`.          |
| `armin/assets/logo.png`             | Both      | 512×512 icon, exported from `design/logo`.                                        |
| `.claude-plugin/marketplace.json`   | Claude    | Installs the plugin from this repository in Claude Code and claude.ai.            |
| `.agents/plugins/marketplace.json`  | Codex     | Installs the plugin from this repository in Codex.                                |

The plugin adds no hooks, scripts, or local servers. Everything goes through the hosted MCP server, so server changes reach users without a new plugin version.

## Before submitting

1. **Deploy the web app** so `https://armincards.app/privacy` and `/terms` are live. Both directories link to them.
2. **Deploy the backend to production.**
3. **Enable and verify the reviewer reset** in production, following the [backend instructions](../packages/backend/README.md#public-reviewer-account). Reviewers use the public login (`reviewer@armincards.app` / `ArminDemo123!`) and should know the shared library is visible to everyone and resets about every six hours.
4. **Record a short demo video** of the five positive review cases in `armin/plugin.json`, host it where OpenAI's reviewers can open it, and set its URL as `review.demo_recording_url`.

The manifests point at `https://intent-bullfrog-922.convex.site/mcp`. OpenAI changes a published plugin's MCP URL only through support, and the server uses `CONVEX_SITE_URL` as its OAuth issuer and audience, so a new address needs backend changes and new URLs in both MCP files.

After any change, run `pnpm plugin:package`. It checks that the manifests agree and the two skill copies match, then writes `dist/plugins/armin-<version>-openai.zip`. Run `claude plugin validate ./plugins/armin` for Anthropic's checks.

## Anthropic's directory

The plugin and the MCP server are two linked submissions at [claude.ai/directory/manage](https://claude.ai/directory/manage). Any paid Claude plan can submit.

1. Connect your GitHub account on claude.ai.
2. **Submit new → MCP connector** with `https://intent-bullfrog-922.convex.site/mcp`. Choose OAuth with dynamic client registration, then add the icon, documentation URL (`https://docs.armincards.app/reference/mcp-server/`), privacy policy, support link (GitHub Issues), and reviewer account. Confirm each synced tool shows its title and read-only or write label.
3. **Submit new → Plugin bundle**, repository `andy-spike/armin`, plugin path `plugins/armin`, tracking `master`. Select **Validate**, fix blocking findings, answer the data-handling questions (the plugin sends card content only to Armin's server), and submit. Pair it with the connector listing.
4. After approval, publish from the portal. Commits to `master` that change `plugins/armin` publish as new versions; raise `version` in both manifests each release.

See Anthropic's [plugin](https://claude.com/docs/plugins/submit) and [connector](https://claude.com/docs/connectors/building/submission) submission guides.

## OpenAI's directory

1. In the OpenAI platform organization that will own the plugin, complete verification and get **Apps Management** write access.
2. Run `pnpm plugin:package`.
3. At [platform.openai.com/plugins](https://platform.openai.com/plugins), choose **Upload new or existing plugin**, pick the developer identity, and upload the ZIP. Fix findings under **Metadata & Skills** and upload again.
4. Under **MCPs**, select **Connect** on `armin`. Set the domain verification token it shows and confirm it is served:

   ```bash
   cd packages/backend
   npx convex env set OPENAI_APPS_CHALLENGE <token> --prod
   curl https://intent-bullfrog-922.convex.site/.well-known/openai-apps-challenge
   ```

   Then connect, sign in with the reviewer account, approve the connection, and wait for the tool scan.

5. Under **Review details**, enter the reviewer account. The five positive and three negative test cases import from `plugin.json`.
6. Submit for review. After approval, choose **Publish plugin**.

OpenAI rescans the MCP server daily, so tool changes go live without a new ZIP. Listing text, icon, or skill changes need a new version and upload. See OpenAI's [submission guide](https://developers.openai.com/plugins/deploy/submission) and [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

ChatGPT Enterprise can restrict plugins by email domain only when the OAuth server offers OpenID Connect with an `email` claim. Armin doesn't, so that restriction is unavailable; the plugin works without it.

## After a listing goes live

In `apps/web/src/components/ai-setup-guide.tsx`, set `directory.listed` to `true` for that client. The AI setup page then sends Claude or ChatGPT users to the plugin directory instead of the custom connector steps.
