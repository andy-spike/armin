import { useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { resetAnalytics } from "@/lib/analytics";

export const authClient = createAuthClient({
  plugins: [convexClient()],
});

let signingOut = false;
const signingOutListeners = new Set<() => void>();

export function signOutToSignIn() {
  signingOut = true;
  for (const listener of signingOutListeners) listener();
  void Promise.allSettled([authClient.signOut(), resetAnalytics()]).then(() =>
    window.location.assign("/sign-in"),
  );
}

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
