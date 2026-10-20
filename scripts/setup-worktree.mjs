import { spawnSync } from "node:child_process";

// Keep provisioning in the backend workspace; install first on fresh T3 checkouts.
for (const args of [
  ["install", "--frozen-lockfile"],
  ["--filter", "@armin/backend", "worktree:setup"],
]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
}
