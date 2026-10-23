import { join } from "node:path";
import {
  assertTarget,
  backend,
  lanHost,
  readEnv,
  readState,
  root,
  updateEnv,
} from "./dev-environment.mjs";

try {
  const state = readState();
  assertTarget(state);
  const values = readEnv(join(backend, ".env.local"));
  for (const key of ["CONVEX_URL", "CONVEX_SITE_URL"]) {
    if (!values[key] || !["http:", "https:"].includes(new URL(values[key]).protocol)) {
      throw new Error(`Missing or invalid ${key} in packages/backend/.env.local`);
    }
  }
  for (const [path, prefix] of [
    ["apps/web/.env.local", "VITE"],
    ["apps/mobile/.env.local", "EXPO_PUBLIC"],
  ]) {
    const file = join(root, path);
    // Expo Go runs off this machine, so it reaches the backend over the LAN.
    const host = prefix === "VITE" ? "127.0.0.1" : lanHost();
    const updates = Object.fromEntries(
      ["CONVEX_URL", "CONVEX_SITE_URL"].map((key) => {
        const url = new URL(values[key]);
        url.hostname = host;
        return [`${prefix}_${key}`, url.origin];
      }),
    );
    if (prefix === "VITE") {
      updates.VITE_SITE_URL = state.siteUrl;
      updates.ARMIN_WEB_PORT = state.webPort;
    }
    updateEnv(file, updates);
    console.log(`Configured ${path}`);
  }
} catch (error) {
  console.error(`Client configuration failed: ${error.message}`);
  console.error("Run pnpm dev:setup to configure this checkout first.");
  process.exitCode = 1;
}
