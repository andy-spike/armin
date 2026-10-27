import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

function staticJwks() {
  try {
    return process.env.JWKS;
  } catch {
    // The CLI also evaluates this module before deployment variables are
    // available. That initial evaluation must keep the dynamic provider.
    return undefined;
  }
}

export default {
  providers: [getAuthConfigProvider({ jwks: staticJwks() })],
} satisfies AuthConfig;
