import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/**
 * The study UI is client-rendered: it depends on the live Convex connection
 * and browser-only editors. Routes are client-only unless they opt in with
 * `ssr: true`. The root and the signed-in `_app` frame opt in, so the server
 * renders the sidebar and the opened page's skeleton (the frame's loading
 * state) and the browser fills in the page. The server also serves the auth,
 * private media, and export routes.
 */
export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [csrfMiddleware],
}));
