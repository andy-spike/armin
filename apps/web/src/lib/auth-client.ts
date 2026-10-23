import { useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

/** Browser auth client; requests go to this app's `/api/auth` proxy. */
export const authClient = createAuthClient({
  plugins: [convexClient()],
});

let signingOut = false;
const signingOutListeners = new Set<() => void>();

/**
 * Ends the session and loads the sign-in page. Signing out deletes the session
 * on the server, which re-runs the live viewer query before the page changes;
 * `useSigningOut` lets the app show a "Signing out" page until then instead of
 * flashing "You're signed out".
 */
export function signOutToSignIn() {
  signingOut = true;
  for (const listener of signingOutListeners) listener();
  void authClient.signOut().finally(() => window.location.assign("/sign-in"));
}

/** True once `signOutToSignIn` has started. */
export function useSigningOut() {
  return useSyncExternalStore(
    (listener) => {
      signingOutListeners.add(listener);
      return () => signingOutListeners.delete(listener);
    },
    () => signingOut,
    () => false,
  );
}

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
