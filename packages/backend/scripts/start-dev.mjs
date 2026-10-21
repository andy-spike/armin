import { spawn } from "node:child_process";
import { assertTarget, readState, root } from "./dev-environment.mjs";

const mode = process.argv[2];
const extra = process.argv.slice(3);
try {
  const state = readState();
  assertTarget(state);
  const commands = {
    web: ["--filter", "@armin/web", "dev"],
    backend: ["--filter", "@armin/backend", "dev"],
    mobile: [
      "--filter",
      "@armin/mobile",
      "start",
      "--port",
      String(state.mobilePort),
    ],
    android: [
      "--filter",
      "@armin/mobile",
      "android",
      "--port",
      String(state.mobilePort),
    ],
    ios: [
      "--filter",
      "@armin/mobile",
      "ios",
      "--port",
      String(state.mobilePort),
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
  const env = { ...process.env, ARMIN_WEB_PORT: String(state.webPort) };
  console.log(
    `Web: ${state.siteUrl}\nConvex: http://127.0.0.1:${state.convexPort} (local)`,
  );
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
