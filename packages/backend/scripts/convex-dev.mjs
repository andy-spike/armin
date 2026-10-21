import { spawn } from "node:child_process";
import {
  assertNode,
  assertTarget,
  backend,
  convexPortArgs,
  readState,
} from "./dev-environment.mjs";

// Runs this checkout's local Convex backend on its allocated ports.
try {
  assertNode();
  const state = readState();
  assertTarget(state);
  const child = spawn(
    "pnpm",
    [
      "exec",
      "convex",
      "dev",
      ...convexPortArgs(state),
      ...process.argv.slice(2),
    ],
    { cwd: backend, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 130 : (code ?? 1);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
