# PostHog analytics and error reports

The web app sends page views, clicks, and errors to the PostHog project `Armin` on US cloud. PostHog starts only when `VITE_POSTHOG_KEY` is set and the build isn't self-hosted, so local dev sends nothing.

| Variable            | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| `VITE_POSTHOG_KEY`  | The project token (Settings → Project → General), `phc_…` |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com`                                |

Both are public and committed in `apps/web/.env.cloudflare`.

## Consent behavior

Nothing is captured until the visitor answers the consent banner. After Allow, PostHog sets a cookie and identifies signed-in users by their Better Auth user ID. After Decline, it counts events without a cookie. Every event has its text, attributes, query strings, and page titles stripped.

## One-time project settings

1. Settings → Project → Web analytics: turn on **Enable cookieless tracking**. Without it PostHog drops every event from visitors who declined.
2. Error tracking: add an alert for new issues. The app turns on exception capture in code, so the project's autocapture toggle doesn't matter.
3. Leave session replay off. Heatmaps and surveys are turned off in code.
4. Settings → Project → Product analytics → Filter out internal and test users: add `$host` does not contain `localhost`, so local checks with the production key stay out of reports.

## Convex function errors

These don't go through the web app. On a Convex Pro plan, open the prod deployment's Settings → Integrations, choose **PostHog Error Tracking**, and enter the same project token with host `https://us.i.posthog.com`. Convex then sends each function exception as a `$exception` event with the function name and stack trace.
