import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  assertTarget,
  readState,
  root,
  run,
  statePath,
} from "./dev-environment.mjs";

const mode = process.argv[2];
const extra = process.argv.slice(3);
let state;
try {
  const gitDir = run("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: root,
    stdio: "pipe",
  });
  const common = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: root, stdio: "pipe" },
  );
  if (gitDir !== common || existsSync(statePath)) {
    state = readState();
    assertTarget(state);
  }
  const commands = {
    web: ["--filter", "@armin/web", "dev"],
    backend: ["--filter", "@armin/backend", "dev"],
    mobile: [
      "--filter",
      "@armin/mobile",
      "start",
      "--port",
      String(state?.mobilePort ?? 8081),
    ],
    android: [
      "--filter",
      "@armin/mobile",
      "android",
      "--port",
      String(state?.mobilePort ?? 8081),
    ],
    ios: [
      "--filter",
      "@armin/mobile",
      "ios",
      "--port",
      String(state?.mobilePort ?? 8081),
    ],
    all: [
      "exec",
      "turbo",
      "run",
      "dev",
      "--filter=@armin/backend",
      "--filter=@armin/web",
    ],
  };
  if (!commands[mode]) throw new Error(`Unknown dev target: ${mode}`);
  const env = { ...process.env };
  if (state) {
    env.ARMIN_WEB_PORT = String(state.webPort);
    console.log(`Web: ${state.siteUrl}\nConvex: ${state.reference}`);
  }
  const child = spawn("pnpm", [...commands[mode], ...extra], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 130 : (code ?? 1);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
