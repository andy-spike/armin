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
    mobile: ["--filter", "@armin/mobile", "start", "--port", String(state.mobilePort)],
    android: ["--filter", "@armin/mobile", "android", "--port", String(state.mobilePort)],
    ios: ["--filter", "@armin/mobile", "ios", "--port", String(state.mobilePort)],
    all: [
      "exec",
      "vp",
      "run",
      "--parallel",
      "--filter",
      "@armin/backend",
      "--filter",
      "@armin/web",
      "dev",
    ],
  };
  if (!commands[mode]) throw new Error(`Unknown dev target: ${mode}`);
  const env = { ...process.env, ARMIN_WEB_PORT: String(state.webPort) };
  console.log(`Web: ${state.siteUrl}\nConvex: http://127.0.0.1:${state.convexPort} (local)`);
  // `vp run` doesn't pass a signal it receives on to its tasks; it relies on
  // the terminal signalling the whole process group. Running it in its own
  // group lets a stop signal sent only to this launcher reach every task. The
  // group gets no stdin, since a background group reading the terminal stops.
  const ownGroup = mode === "all";
  const child = spawn("pnpm", [...commands[mode], ...extra], {
    cwd: root,
    env,
    stdio: ownGroup ? ["ignore", "inherit", "inherit"] : "inherit",
    detached: ownGroup,
  });
  const stop = (signal) => {
    try {
      if (ownGroup && child.pid !== undefined) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      // The child already exited.
    }
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
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
