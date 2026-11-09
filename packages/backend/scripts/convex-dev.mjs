import { spawn } from "node:child_process";
import {
  assertNode,
  assertTarget,
  backend,
  convexPortArgs,
  convexTempDir,
  readState,
  refreshSiteUrl,
  syncConvexSiteUrl,
} from "./dev-environment.mjs";

// Runs this checkout's local Convex backend on its allocated ports.
try {
  assertNode();
  const state = refreshSiteUrl(readState());
  assertTarget(state);
  const tempDir = convexTempDir();
  const child = spawn(
    "pnpm",
    ["exec", "convex", "dev", ...convexPortArgs(state), ...process.argv.slice(2)],
    {
      cwd: backend,
      stdio: "inherit",
      env: { ...process.env, TMPDIR: tempDir, CONVEX_TMPDIR: tempDir },
    },
  );
  // A worktree's origin follows its branch name, which T3 can change after setup.
  syncConvexSiteUrl(state).catch((error) =>
    console.error(`Could not update SITE_URL: ${error.message} Rerun pnpm worktree:setup.`),
  );
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 130 : (code ?? 1);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
