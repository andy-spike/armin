import { existsSync } from "node:fs";
import { join } from "node:path";
import { root, run, statePath } from "./dev-environment.mjs";

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
    run("node", [join(root, "packages/backend/scripts/setup-worktree.mjs")]);
  } else {
    run("pnpm", ["exec", "convex", "dev", "--once"]);
    run("node", [join(root, "packages/backend/scripts/configure-clients.mjs")]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
