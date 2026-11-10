import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

function staticJwks() {
  try {
    return process.env.JWKS;
  } catch {
    return undefined;
  }
}

export default {
  providers: [getAuthConfigProvider({ jwks: staticJwks() })],
} satisfies AuthConfig;
