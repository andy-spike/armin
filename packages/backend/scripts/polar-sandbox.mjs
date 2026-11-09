import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { webhooks } from "@polar-sh/sdk/2026-10";
import { assertTarget, convex, readEnv, root, run } from "./dev-environment.mjs";

export const sandboxDirectory = join(homedir(), ".config/armin");
export const sandboxConfigPath = join(sandboxDirectory, "polar-sandbox.env");
const targetsDirectory = join(sandboxDirectory, "polar-targets");

export function sandboxConfig() {
  if (!existsSync(sandboxConfigPath)) return null;
  const config = readEnv(sandboxConfigPath);
  const overrides = readEnv(join(root, ".armin/polar-sandbox.env"));
  for (const [key, value] of Object.entries(overrides)) {
    if (
      ![
        "POLAR_ORGANIZATION_TOKEN",
        "POLAR_PRODUCT_PRO_MONTHLY",
        "POLAR_PRODUCT_PRO_YEARLY",
      ].includes(key)
    )
      throw new Error(
        `Unsupported worktree Polar override: ${key}. Only the API token and product IDs may be overridden.`,
      );
    config[key] = value;
  }
  if (config.POLAR_SERVER !== "sandbox")
    throw new Error("Local Polar configuration must set POLAR_SERVER=sandbox.");
  for (const key of [
    "POLAR_ORGANIZATION_TOKEN",
    "POLAR_PRODUCT_PRO_MONTHLY",
    "POLAR_PRODUCT_PRO_YEARLY",
    "POLAR_WEBHOOK_SECRET",
    "POLAR_SANDBOX_ORGANIZATION_ID",
  ])
    if (!config[key]) throw new Error(`Missing ${key} in ${sandboxConfigPath}.`);
  const port = Number(config.POLAR_RELAY_PORT ?? 3219);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid POLAR_RELAY_PORT.");
  return {
    config,
    port,
    fingerprint: createHash("sha256")
      .update(`${config.POLAR_SANDBOX_ORGANIZATION_ID}:${config.POLAR_WEBHOOK_SECRET}`)
      .digest("hex"),
  };
}

function assertSandboxSession(config) {
  const session = JSON.parse(run("polar", ["auth", "whoami", "--json"], { stdio: "pipe" }));
  if (
    session.organization?.environment !== "sandbox" ||
    session.organization?.id !== config.POLAR_SANDBOX_ORGANIZATION_ID
  )
    throw new Error(
      "Polar CLI must be signed into the configured sandbox organization. Run polar auth login --sandbox.",
    );
  const { secret } = JSON.parse(
    run(
      "polar",
      [
        "webhook",
        "listen",
        "--org",
        config.POLAR_SANDBOX_ORGANIZATION_ID,
        "--print-secret",
        "--json",
      ],
      { stdio: "pipe" },
    ),
  );
  if (secret !== config.POLAR_WEBHOOK_SECRET)
    throw new Error(
      "Polar CLI signing secret changed; update the shared sandbox configuration and rerun setup.",
    );
}

export function configureSandbox(state) {
  const settings = sandboxConfig();
  if (!settings) {
    console.log("Polar sandbox not configured on this machine; billing stays unchanged.");
    return;
  }
  assertTarget(state);
  assertSandboxSession(settings.config);
  const variables = Object.entries(settings.config).filter(([key]) =>
    [
      "POLAR_SERVER",
      "POLAR_ORGANIZATION_TOKEN",
      "POLAR_PRODUCT_PRO_MONTHLY",
      "POLAR_PRODUCT_PRO_YEARLY",
      "POLAR_WEBHOOK_SECRET",
    ].includes(key),
  );
  convex(["env", "set", "--force"], {
    input: variables.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"),
    stdio: ["pipe", "pipe", "inherit"],
  });
  mkdirSync(targetsDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(targetsDirectory, `${createHash("sha256").update(root).digest("hex")}.json`),
    JSON.stringify({ root, port: state.convexSitePort, fingerprint: settings.fingerprint }),
    { mode: 0o600 },
  );
  console.log("Polar sandbox configured; pnpm dev starts webhook forwarding automatically.");
}

export async function ensureSandboxRelay() {
  const settings = sandboxConfig();
  if (!settings) return;
  const healthUrl = `http://127.0.0.1:${settings.port}/health`;
  const healthy = async () => {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
      return (await response.json()).fingerprint === settings.fingerprint;
    } catch {
      return false;
    }
  };
  if (await healthy()) return;
  assertSandboxSession(settings.config);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await healthy()) {
      console.log(`Polar sandbox webhook relay: http://127.0.0.1:${settings.port}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Could not start Polar sandbox relay on port ${settings.port}. Run pnpm dev:polar for diagnostics; check for a conflicting listener.`,
  );
}

async function serve() {
  const settings = sandboxConfig();
  if (!settings) throw new Error(`Create ${sandboxConfigPath} first.`);
  assertSandboxSession(settings.config);
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ fingerprint: settings.fingerprint }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/polar/events") {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const headers = Object.fromEntries(
        ["webhook-id", "webhook-timestamp", "webhook-signature"].map((key) => [
          key,
          String(request.headers[key] ?? ""),
        ]),
      );
      try {
        await webhooks.validateEvent(
          body.toString("utf8"),
          headers,
          settings.config.POLAR_WEBHOOK_SECRET,
        );
      } catch (error) {
        if (
          !(error instanceof webhooks.PolarWebhookError) ||
          error instanceof webhooks.PolarWebhookVerificationError
        ) {
          response.writeHead(403).end();
          return;
        }
      }
      const targets = existsSync(targetsDirectory)
        ? readdirSync(targetsDirectory).filter((name) => name.endsWith(".json"))
        : [];
      let failed = false;
      await Promise.all(
        targets.map(async (name) => {
          try {
            const target = JSON.parse(readFileSync(join(targetsDirectory, name), "utf8"));
            if (
              target.fingerprint !== settings.fingerprint ||
              !existsSync(target.root) ||
              !Number.isInteger(target.port) ||
              target.port < 1024 ||
              target.port > 65535
            )
              return;
            const result = await fetch(`http://127.0.0.1:${target.port}/polar/events`, {
              method: "POST",
              headers: { ...headers, "content-type": "application/json" },
              body,
              signal: AbortSignal.timeout(10000),
            });
            if (!result.ok) {
              failed = true;
              console.error(`Polar forwarding to port ${target.port}: HTTP ${result.status}`);
            }
            await result.arrayBuffer();
          } catch (error) {
            if (error.cause?.code !== "ECONNREFUSED") {
              failed = true;
              console.error("Polar forwarding failed; delivery should be retried.");
            }
          }
        }),
      );
      response.writeHead(failed ? 503 : 202).end();
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(settings.port, "127.0.0.1", resolve);
  });
  console.log(`Polar sandbox relay listening on http://127.0.0.1:${settings.port}`);
  const listener = spawn(
    "polar",
    [
      "webhook",
      "listen",
      "--org",
      settings.config.POLAR_SANDBOX_ORGANIZATION_ID,
      `http://127.0.0.1:${settings.port}/polar/events`,
    ],
    { stdio: "ignore" },
  );
  const stop = () => {
    listener.kill("SIGTERM");
    server.close();
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
  listener.on("error", () => {
    console.error("Polar CLI could not start.");
    server.close();
    process.exitCode = 1;
  });
  listener.on("exit", () => {
    console.error("Polar CLI stopped. Restart with pnpm dev:polar.");
    server.close();
    process.exitCode = 1;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await serve();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
