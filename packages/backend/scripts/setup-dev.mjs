import { join } from "node:path";
import { backend, run } from "./dev-environment.mjs";

// The main checkout and every worktree share one local-deployment setup path.
try {
  run("node", [join(backend, "scripts/setup-worktree.mjs")]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
