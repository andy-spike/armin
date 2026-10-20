import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { convexSiteUrl } from "./env";

/**
 * Better Auth client for native. Requests go straight to the Convex
 * deployment's `/api/auth` routes; the session cookie lives in SecureStore.
 */
export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  plugins: [
    expoClient({ scheme: "armin", storagePrefix: "armin", storage: SecureStore }),
    convexClient(),
  ],
});

/** A short-lived Convex token for authenticated HTTP routes (private images). */
export async function convexToken() {
  const { data } = await authClient.convex.token({ fetchOptions: { throw: false } });
  return data?.token ?? null;
}
