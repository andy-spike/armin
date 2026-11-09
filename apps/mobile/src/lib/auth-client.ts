import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { convexSiteUrl } from "./env";

export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  plugins: [
    expoClient({
      scheme: "armin",
      storagePrefix: `armin-${new URL(convexSiteUrl).hostname}`,
      storage: SecureStore,
    }),
    convexClient(),
  ],
});

export async function convexToken() {
  const { data } = await authClient.convex.token({
    fetchOptions: { throw: false },
  });
  return data?.token ?? null;
}
