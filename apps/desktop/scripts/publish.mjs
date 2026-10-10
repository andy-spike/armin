import { spawnSync } from "node:child_process";
function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  const result = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) return result.stdout.trim();

  const detail = result.stderr.trim() || "gh auth token failed";
  throw new Error(
    `GITHUB_TOKEN is not set and GitHub CLI could not provide one: ${detail}\n` +
      "Run `gh auth login`, or set GITHUB_TOKEN manually.",
  );
}

const env = {
  ...process.env,
  GITHUB_TOKEN: githubToken(),
};

// On Windows the shell resolves whichever pnpm shim is installed (.cmd or .exe).
const result = spawnSync("pnpm", ["exec", "electron-forge", "publish"], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
