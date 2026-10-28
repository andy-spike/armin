import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

// Checks that the Claude and OpenAI manifests in plugins/armin agree, then
// builds the ZIP that OpenAI's plugin portal uploads. Anthropic's directory
// reads the plugin folder straight from GitHub, so it needs no archive.
const root = join(import.meta.dirname, "..");
const plugin = join(root, "plugins/armin");
const readJson = (path) => JSON.parse(readFileSync(join(plugin, path), "utf8"));

const problems = [];
const openai = readJson("plugin.json");
const claude = readJson(".claude-plugin/plugin.json");
for (const field of ["name", "version", "description", "license"])
  if (openai[field] !== claude[field])
    problems.push(`plugin.json and .claude-plugin/plugin.json differ in "${field}".`);

const openaiUrl = readJson("mcp.json").mcpServers.armin?.url;
const claudeUrl = readJson(".mcp.json").mcpServers.armin?.url;
if (!openaiUrl || openaiUrl !== claudeUrl)
  problems.push("mcp.json and .mcp.json must point the armin server at the same URL.");

// The repository also publishes each skill for `npx skills add`; keep both copies identical.
const files = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
for (const skill of ["writing-study-cards", "importing-anki-decks"]) {
  const bundled = join(plugin, "skills", skill);
  const published = join(root, ".agents/skills", skill);
  const bundledFiles = files(bundled);
  if (
    bundledFiles.join() !== files(published).join() ||
    bundledFiles.some(
      (file) => !readFileSync(join(bundled, file)).equals(readFileSync(join(published, file))),
    )
  )
    problems.push(`plugins/armin/skills/${skill} differs from .agents/skills/${skill}.`);
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const out = join(root, "dist/plugins");
const zip = join(out, `armin-${openai.version}-openai.zip`);
mkdirSync(out, { recursive: true });
rmSync(zip, { force: true });
// OpenAI reads the portable manifest; leave out the Claude-only files.
const result = spawnSync(
  "zip",
  ["-r", "-X", zip, "plugin.json", "mcp.json", "skills", "assets", "README.md", "LICENSE"],
  { cwd: plugin, stdio: "inherit" },
);
if (result.error || result.status !== 0) {
  console.error("Couldn't build the ZIP. Install the zip command and try again.");
  process.exit(result.status ?? 1);
}
console.log(`\nWrote ${relative(root, zip)}`);
