// Local controls only: these do not exercise Cloudflare Containers or R2.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const fixtures = ["limit-max", "max-content", "media-heavy", "high-compression", "limit-text"];
for (const name of fixtures) {
  const extension = name === "limit-text" ? "txt" : "apkg";
  const result = `.armin/anki-bench/results/${name}.cloudflare-local-control.json`;
  const run = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "docs/research/anki-import-bench/web-baseline.ts",
      "--file",
      `.armin/anki-bench/fixtures/${name}.${extension}`,
      "--out",
      result,
    ],
    { stdio: "ignore" },
  );
  if (run.status !== 0) throw new Error(`Local control failed: ${name}`);
  const current = JSON.parse(readFileSync(result, "utf8"));
  const previous = JSON.parse(readFileSync(`.armin/anki-bench/results/${name}.web.json`, "utf8"));
  const parity = current.planDigest === previous.planDigest;
  console.log(
    `${name}: digest ${parity ? "matches" : "DIFFERS"}; ${Math.round(current.timing.totalMs)} ms; peak RSS ${Math.round(current.memory.final.maxRssKb / 1024)} MiB`,
  );
  if (!parity) process.exitCode = 1;
}
