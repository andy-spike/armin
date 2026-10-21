import { seedWorktree } from "./seed-worktree.mjs";
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  allocate,
  assertNode,
  assertTarget,
  backend,
  convex,
  convexPortArgs,
  isMainCheckout,
  mainState,
  readEnv,
  readState,
  run,
  saveState,
  statePath,
  unsetEnv,
} from "./dev-environment.mjs";

// Starts this checkout's local backend and resolves once functions are pushed.
// CONVEX_AGENT_MODE=anonymous creates a deployment without a Convex account.
function startBackend(state) {
  const child = spawn(
    "pnpm",
    [
      "exec",
      "convex",
      "dev",
      "--tail-logs",
      "disable",
      ...convexPortArgs(state),
    ],
    {
      cwd: backend,
      env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  const stop = () =>
    new Promise((done) => {
      if (child.exitCode !== null) return done();
      child.once("exit", done);
      process.kill(-child.pid, "SIGINT");
    });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error("Convex functions were not ready within 5 minutes.")),
      300_000,
    );
    let output = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        process.stderr.write(chunk);
        output += chunk;
        if (output.includes("Convex functions ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`convex dev exited with code ${code} during setup.`));
    });
  });
  return { ready, stop };
}

let backendProcess;
try {
  assertNode();
  for (const key of [
    "CONVEX_DEPLOY_KEY",
    "CONVEX_DEPLOYMENT",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
  ]) {
    if (process.env[key]) throw new Error(`Unset shell ${key} before setup.`);
  }
  const main = isMainCheckout();
  const state = existsSync(statePath)
    ? readState()
    : main
      ? mainState()
      : await allocate();
  saveState(state);
  const envFile = join(backend, ".env.local");
  const values = readEnv(envFile);
  if (
    values.CONVEX_DEPLOYMENT &&
    !values.CONVEX_DEPLOYMENT.startsWith("anonymous:")
  ) {
    if (!main)
      throw new Error(
        "Found a Convex cloud selection in packages/backend/.env.local. Start with a fresh worktree instead of copying backend .env.local.",
      );
    // The main checkout moves from its cloud dev deployment to a local one.
    copyFileSync(envFile, `${envFile}.cloud-backup`);
    unsetEnv(envFile, [
      "CONVEX_DEPLOYMENT",
      "CONVEX_URL",
      "CONVEX_SITE_URL",
      "CONVEX_DEPLOY_KEY",
    ]);
    console.log(
      "Moved the cloud selection to packages/backend/.env.local.cloud-backup.",
    );
  }
  backendProcess = startBackend(state);
  await backendProcess.ready;
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
  run("node", [join(backend, "scripts/configure-clients.mjs")]);
  await seedWorktree();
  console.log(
    `Local environment ready: ${state.siteUrl}\nConvex: http://127.0.0.1:${state.convexPort}\nRun pnpm dev. Expo: pnpm dev:mobile`,
  );
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await backendProcess?.stop();
}
