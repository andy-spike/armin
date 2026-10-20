import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

/** Browser auth client; requests go to this app's `/api/auth` proxy. */
export const authClient = createAuthClient({
  plugins: [convexClient()],
});
