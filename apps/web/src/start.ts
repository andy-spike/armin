import { createStart } from "@tanstack/react-start";

/**
 * The study UI is client-rendered: it depends on the live Convex connection
 * and browser-only editors. The server renders the document shell and serves
 * the auth, private media, and export routes.
 */
export const startInstance = createStart(() => ({
  defaultSsr: false,
}));
