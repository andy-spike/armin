import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
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
    throw new Error(
      `${command} ${args.slice(0, 2).join(" ")} failed. ${result.error?.message ?? "Check the preceding diagnostic or your Convex login."}`,
    );
  }
  return result.stdout?.trim();
}

export function convex(args, options) {
  return run("pnpm", ["exec", "convex", ...args], options);
}

export function assertNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (![20, 22, 24].includes(major))
    throw new Error(
      `Node ${process.versions.node} cannot run Convex "use node" actions locally. Use Node 24 from .nvmrc, e.g. mise exec node@24 -- pnpm worktree:setup.`,
    );
}

export function convexTempDir() {
  const tempDir = join(backend, ".convex", "tmp");
  mkdirSync(tempDir, { recursive: true });
  if (tempDir.length + "/.tmpXXXXXX/.executor.sock".length < 100) return tempDir;
  const id = createHash("sha256").update(tempDir).digest("hex").slice(0, 12);
  const link = join(tmpdir(), `armin-convex-${id}`);
  let current;
  try {
    current = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : null;
  } catch {}
  if (current !== tempDir) {
    if (current !== undefined) rmSync(link, { force: true });
    symlinkSync(tempDir, link);
  }
  return link;
}

export function convexPortArgs(state) {
  return [
    "--local-cloud-port",
    String(state.convexPort),
    "--local-site-port",
    String(state.convexSitePort),
  ];
}

export function lanHost() {
  if (process.env.ARMIN_DEV_HOST) return process.env.ARMIN_DEV_HOST;
  for (const entries of Object.values(networkInterfaces()))
    for (const entry of entries ?? [])
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
  return "127.0.0.1";
}

export function isMainCheckout() {
  const gitDir = run("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: root,
    stdio: "pipe",
  });
  const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    stdio: "pipe",
  });
  return gitDir === common;
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

export function unsetEnv(path, keys) {
  const text = readFileSync(path, "utf8");
  const pattern = new RegExp(`^\\s*(?:export\\s+)?(?:${keys.join("|")})\\s*=.*\\n?`, "gm");
  writeFileSync(path, text.replace(pattern, ""), { mode: 0o600 });
}

export function readState() {
  if (!existsSync(statePath))
    throw new Error(
      "Run pnpm dev:setup (or pnpm worktree:setup) before starting the dev environment.",
    );
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.version !== 2)
    throw new Error(
      "This checkout was set up for a Convex cloud dev deployment. Delete .armin/dev.json and packages/backend/.env.local, then rerun setup to use a local deployment.",
    );
  if (state.root !== root)
    throw new Error(
      "Environment belongs to a different checkout. Run setup in a fresh worktree; never copy .armin or .env.local files.",
    );
  return state;
}

export function assertTarget(state) {
  const values = readEnv(join(backend, ".env.local"));
  if (
    !values.CONVEX_DEPLOYMENT?.startsWith("anonymous:") ||
    values.CONVEX_DEPLOY_KEY ||
    values.CONVEX_URL !== `http://127.0.0.1:${state.convexPort}`
  ) {
    throw new Error(
      "Convex selection is not this checkout's local deployment. Refusing to push or seed. Rerun pnpm dev:setup.",
    );
  }
  for (const name of [
    "CONVEX_DEPLOY_KEY",
    "CONVEX_DEPLOYMENT",
    "CONVEX_SELF_HOSTED_URL",
    "CONVEX_SELF_HOSTED_ADMIN_KEY",
  ]) {
    if (process.env[name])
      throw new Error(`Unset shell ${name}; this environment uses its own backend .env.local.`);
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
    server.listen(port, () => server.close(() => resolvePort(true)));
  });
}

export function mainState() {
  return {
    version: 2,
    root,
    id: "main",
    webPort: 3000,
    mobilePort: 8081,
    convexPort: 3210,
    convexSitePort: 3211,
    siteUrl: "http://localhost:3000",
  };
}

const slug = (value) => value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const label = (value, length = 63) => slug(value.slice(0, length));

function branchLabel(branch, path) {
  return label(slug((branch.replace(/^t3\//, "") || basename(path)).toLowerCase())) || "worktree";
}

export function hostLabel(id) {
  const own = branchLabel(
    run("git", ["branch", "--show-current"], { cwd: root, stdio: "pipe" }),
    root,
  );
  const others = run("git", ["worktree", "list", "--porcelain"], { cwd: root, stdio: "pipe" })
    .split(/\n\n+/)
    .map((block) => ({
      path: block.match(/^worktree (.+)$/m)?.[1] ?? "",
      branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "",
    }))
    .slice(1)
    .filter(({ path }) => resolve(path) !== resolve(root))
    .map(({ branch, path }) => branchLabel(branch, path));
  if (!others.includes(own)) return own;
  const suffix = `-${id.slice(0, 6)}`;
  return `${label(own, 63 - suffix.length)}${suffix}`;
}

function worktreeSiteUrl(id, webPort) {
  return `http://${hostLabel(id)}.armin.localhost:${webPort}`;
}

export function refreshSiteUrl(state) {
  if (state.id === "main") return state;
  const siteUrl = worktreeSiteUrl(state.id, state.webPort);
  if (siteUrl === state.siteUrl) return state;
  const next = { ...state, siteUrl };
  saveState(next);
  const webEnv = join(root, "apps/web/.env.local");
  if (existsSync(webEnv)) updateEnv(webEnv, { VITE_SITE_URL: siteUrl });
  console.log(`Web origin follows the branch name: ${state.siteUrl} -> ${siteUrl}`);
  return next;
}

export async function syncConvexSiteUrl(state, signal) {
  const deadline = Date.now() + 300_000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${state.convexPort}/version`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]),
      });
      if (response.ok) break;
    } catch {
      signal.throwIfAborted();
    }
    if (Date.now() > deadline) throw new Error("The local backend did not start within 5 minutes.");
    await sleep(500, undefined, { signal });
  }
  const exec = (args) =>
    new Promise((resolveExec, rejectExec) =>
      execFile(
        "pnpm",
        ["exec", "convex", ...args],
        { cwd: backend, signal, timeout: 60_000 },
        (error, stdout) => {
          if (signal.aborted) rejectExec(signal.reason);
          else if (error) rejectExec(new Error(`convex ${args[0]} ${args[1]} failed.`));
          else resolveExec(stdout);
        },
      ),
    );
  if ((await exec(["env", "get", "SITE_URL"])).trim() === state.siteUrl) return;
  await exec(["env", "set", "SITE_URL", state.siteUrl]);
  console.log(`Set the local deployment's SITE_URL to ${state.siteUrl}`);
}

const SLOT_BASE = 4100;
const SLOT_STEP = 10;
const SLOT_COUNT = 590;

export async function allocate() {
  const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    stdio: "pipe",
  });
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
    const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, "utf8")) : {};
    for (const path of Object.keys(registry)) if (!existsSync(path)) delete registry[path];
    if (registry[root]?.version === 2) return registry[root];
    const id = createHash("sha256").update(root).digest("hex").slice(0, 10);
    const main = mainState();
    const taken = new Set([
      main.webPort,
      main.mobilePort,
      main.convexPort,
      main.convexSitePort,
      Number(readEnv(join(homedir(), ".config/armin/polar-sandbox.env")).POLAR_RELAY_PORT ?? 3219),
      ...Object.entries(registry)
        .filter(([path]) => path !== root)
        .flatMap(([, entry]) => [
          entry.webPort,
          entry.mobilePort,
          entry.convexPort,
          entry.convexSitePort,
        ]),
    ]);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const webPort = SLOT_BASE + slot * SLOT_STEP;
      const ports = [webPort, webPort + 1, webPort + 2, webPort + 3];
      if (ports.some((port) => taken.has(port))) continue;
      let free = true;
      for (const port of ports) free &&= await portFree(port);
      if (!free) continue;
      const state = {
        version: 2,
        root,
        id,
        webPort,
        mobilePort: webPort + 1,
        convexPort: webPort + 2,
        convexSitePort: webPort + 3,
        siteUrl: worktreeSiteUrl(id, webPort),
      };
      registry[root] = state;
      writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
      return state;
    }
    throw new Error("No worktree port block is available.");
  } finally {
    rmSync(lock, { recursive: true });
  }
}
