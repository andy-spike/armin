import { join } from "node:path";
import { backend, run } from "./dev-environment.mjs";

try {
  run("node", [join(backend, "scripts/setup-worktree.mjs")]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
