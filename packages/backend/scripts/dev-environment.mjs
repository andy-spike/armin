import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const backend = join(root, "packages/backend");
export const statePath = join(root, ".armin/dev.json");

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: backend,
    env: process.env,
    stdio: "inherit",
    timeout: 300_000,
    ...options,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    // Captured stdout can contain deploy keys, env values, or auth records.
    throw new Error(
      `${command} ${args.slice(0, 2).join(" ")} failed. ${result.error?.message ?? "Check the preceding diagnostic or your Convex login."}`,
    );
  }
  return result.stdout?.trim();
}

export function convex(args, options) {
  return run("pnpm", ["exec", "convex", ...args], options);
}

export function readEnv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

export function updateEnv(path, values) {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${JSON.stringify(String(value))}`;
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, "gm");
    text = pattern.test(text)
      ? text.replace(pattern, () => line)
      : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  writeFileSync(path, text, { mode: 0o600 });
}

export function readState() {
  if (!existsSync(statePath))
    throw new Error(
      "Run pnpm worktree:setup before starting an agent environment.",
    );
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.root !== root)
    throw new Error(
      "Environment belongs to a different checkout. Run setup in a fresh worktree; never copy .armin or .env.local files.",
    );
  return state;
}

export function assertTarget(state) {
  const values = readEnv(join(backend, ".env.local"));
  const keyDeployment = values.CONVEX_DEPLOY_KEY?.match(/^dev:([^|]+)\|/u)?.[1];
  if (
    !state.deployment ||
    keyDeployment !== state.deployment ||
    values.CONVEX_DEPLOYMENT !== `dev:${state.deployment}`
  ) {
    throw new Error(
      "Convex selection does not match this worktree's scoped dev key. Refusing to push or seed.",
    );
  }
  for (const name of [
    "CONVEX_DEPLOY_KEY",
    "CONVEX_DEPLOYMENT",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
  ]) {
    if (process.env[name])
      throw new Error(
        `Unset shell ${name}; this environment uses its own backend .env.local.`,
      );
  }
  return values;
}

export function saveState(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

function portFree(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.listen(port, "127.0.0.1", () =>
      server.close(() => resolvePort(true)),
    );
  });
}

export async function allocate() {
  const common = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: root, stdio: "pipe" },
  );
  const lock = join(common, "armin-environments.lock");
  const registryPath = join(common, "armin-environments.json");
  let locked = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      mkdirSync(lock);
      locked = true;
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  if (!locked)
    throw new Error(
      `Environment allocation is locked. If no setup is running, remove ${lock} and retry.`,
    );
  try {
    const registry = existsSync(registryPath)
      ? JSON.parse(readFileSync(registryPath, "utf8"))
      : {};
    for (const path of Object.keys(registry))
      if (!existsSync(path)) delete registry[path];
    if (registry[root]) return registry[root];
    const id = createHash("sha256").update(root).digest("hex").slice(0, 10);
    const start = Number.parseInt(id.slice(0, 6), 16) % 15000;
    for (let offset = 0; offset < 15000; offset++) {
      const webPort = 10000 + ((start + offset) % 15000) * 2;
      const mobilePort = webPort + 1;
      if (Object.values(registry).some((entry) => entry.webPort === webPort))
        continue;
      if (!(await portFree(webPort)) || !(await portFree(mobilePort))) continue;
      const state = {
        version: 1,
        root,
        id,
        webPort,
        mobilePort,
        siteUrl: `http://armin-${id}.localhost:${webPort}`,
        reference: `andy-spike:armin:dev/t3code/${id}`,
      };
      registry[root] = state;
      writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
      return state;
    }
    throw new Error("No worktree port pair is available.");
  } finally {
    rmSync(lock, { recursive: true });
  }
}
