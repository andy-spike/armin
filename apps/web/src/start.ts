import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/**
 * The study UI is client-rendered: it depends on the live Convex connection
 * and browser-only editors. The server renders the document shell and serves
 * the auth, private media, and export routes.
 */
export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [csrfMiddleware],
}));
