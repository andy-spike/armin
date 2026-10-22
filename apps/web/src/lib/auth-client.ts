import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

/** Browser auth client; requests go to this app's `/api/auth` proxy. */
export const authClient = createAuthClient({
  plugins: [convexClient()],
});

/**
 * The same-origin relative path in a `redirect` search parameter, or
 * undefined. Absolute, protocol-relative, and backslash URLs are rejected so
 * a sign-in link can never send the user to another origin.
 */
export function safeRedirectPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  const base = "http://localhost";
  try {
    const url = new URL(value, base);
    if (url.origin !== base) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}
