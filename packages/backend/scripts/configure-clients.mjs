import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  assertTarget,
  backend,
  readEnv,
  readState,
  root,
  statePath,
  updateEnv,
} from "./dev-environment.mjs";

try {
  const state = existsSync(statePath) ? readState() : null;
  if (state) assertTarget(state);
  const values = readEnv(join(backend, ".env.local"));
  for (const key of ["CONVEX_URL", "CONVEX_SITE_URL"]) {
    if (
      !values[key] ||
      !["http:", "https:"].includes(new URL(values[key]).protocol)
    ) {
      throw new Error(
        `Missing or invalid ${key} in packages/backend/.env.local`,
      );
    }
  }
  for (const [path, prefix] of [
    ["apps/web/.env.local", "VITE"],
    ["apps/mobile/.env.local", "EXPO_PUBLIC"],
  ]) {
    const file = join(root, path);
    const updates = Object.fromEntries(
      ["CONVEX_URL", "CONVEX_SITE_URL"].map((key) => [
        `${prefix}_${key}`,
        values[key],
      ]),
    );
    if (prefix === "VITE") {
      updates.VITE_SITE_URL =
        state?.siteUrl ??
        readEnv(file).VITE_SITE_URL ??
        "http://localhost:3000";
      if (state) updates.ARMIN_WEB_PORT = state.webPort;
    }
    updateEnv(file, updates);
    console.log(`Configured ${path}`);
  }
} catch (error) {
  console.error(`Client configuration failed: ${error.message}`);
  console.error("Run pnpm dev:setup to configure this checkout first.");
  process.exitCode = 1;
}
