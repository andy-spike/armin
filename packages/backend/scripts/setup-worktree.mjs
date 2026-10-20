import { seedWorktree } from "./seed-worktree.mjs";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  allocate,
  assertTarget,
  backend,
  convex,
  readEnv,
  readState,
  root,
  run,
  saveState,
  statePath,
} from "./dev-environment.mjs";

try {
  const gitDir = run("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: root,
    stdio: "pipe",
  });
  const commonDir = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: root, stdio: "pipe" },
  );
  if (gitDir === commonDir)
    throw new Error(
      "Use a linked Git worktree for agent setup. The main checkout keeps its existing dev deployment.",
    );
  for (const key of [
    "CONVEX_DEPLOY_KEY",
    "CONVEX_DEPLOYMENT",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
  ]) {
    if (process.env[key]) throw new Error(`Unset shell ${key} before setup.`);
  }
  let state = existsSync(statePath) ? readState() : await allocate();
  saveState(state);
  const envFile = join(backend, ".env.local");
  let values = readEnv(envFile);
  if (!state.deployment) {
    if (values.CONVEX_DEPLOYMENT || values.CONVEX_DEPLOY_KEY) {
      throw new Error(
        "Found an existing Convex selection without an owned deployment record. Start with a fresh worktree instead of copying backend .env.local.",
      );
    }
    // Select first on retries: creation may have succeeded before a connection failed.
    const selected = spawnSync(
      "pnpm",
      ["exec", "convex", "deployment", "select", state.reference],
      { cwd: backend, stdio: "ignore" },
    );
    if (selected.error) throw selected.error;
    if (selected.status !== 0) {
      convex([
        "deployment",
        "create",
        state.reference,
        "--type",
        "dev",
        "--select",
        "--expiration",
        "in 5 days",
      ]);
    }
    values = readEnv(envFile);
    state.deployment = values.CONVEX_DEPLOYMENT?.replace(/^dev:/u, "");
    if (!state.deployment)
      throw new Error("Convex did not select a dev deployment.");
    saveState(state);
  }
  values = readEnv(envFile);
  if (!values.CONVEX_DEPLOY_KEY) {
    convex([
      "deployment",
      "token",
      "create",
      "t3code-agent",
      "--deployment",
      state.reference,
      "--save-env",
    ]);
  }
  chmodSync(envFile, 0o600);
  assertTarget(state);
  const names = new Set(
    convex(["env", "list", "--names-only"], {
      stdio: ["ignore", "pipe", "inherit"],
    }).split(/\s+/),
  );
  const settings = {
    SITE_URL: state.siteUrl,
    MOBILE_TRUSTED_ORIGINS: "armin://,exp://,exp://**",
  };
  if (!names.has("BETTER_AUTH_SECRET"))
    settings.BETTER_AUTH_SECRET = randomBytes(32).toString("base64");
  convex(["env", "set", "--force"], {
    input: Object.entries(settings)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n"),
    stdio: ["pipe", "pipe", "inherit"],
  });
  convex(["dev", "--once"]);
  run("node", [join(backend, "scripts/configure-clients.mjs")]);
  await seedWorktree();
  console.log(
    `Agent environment ready: ${state.siteUrl}\nDeployment: ${state.reference}\nRun pnpm dev. Expo: pnpm dev:mobile`,
  );
} catch (error) {
  console.error(`Worktree setup failed: ${error.message}`);
  process.exitCode = 1;
}
