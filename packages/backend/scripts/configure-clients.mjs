import { readFile, writeFile } from "node:fs/promises";

const backend = new URL("../.env.local", import.meta.url);
const root = new URL("../../../", import.meta.url);

function readValues(content) {
  return Object.fromEntries(
    content.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
      return match
        ? [[match[1], match[2].replace(/^(["'])(.*)\1$/, "$2")]]
        : [];
    }),
  );
}

async function configure() {
  const values = readValues(await readFile(backend, "utf8"));
  for (const key of ["CONVEX_URL", "CONVEX_SITE_URL"]) {
    if (
      !values[key] ||
      !["http:", "https:"].includes(new URL(values[key]).protocol)
    ) {
      throw new Error(
        `Missing or invalid ${key} in packages/backend/.env.local`,
      );
    }
  }

  for (const [path, prefix] of [
    ["apps/web/.env.local", "VITE"],
    ["apps/mobile/.env.local", "EXPO_PUBLIC"],
  ]) {
    const file = new URL(path, root);
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      content = "";
    }
    for (const key of ["CONVEX_URL", "CONVEX_SITE_URL"]) {
      const name = `${prefix}_${key}`;
      const entry = `${name}=${values[key]}`;
      const pattern = new RegExp(`^\\s*${name}\\s*=.*$`, "gm");
      content = pattern.test(content)
        ? content.replace(pattern, () => entry)
        : `${content}${content && !content.endsWith("\n") ? "\n" : ""}${entry}\n`;
    }
    if (prefix === "VITE" && !/^\s*VITE_SITE_URL\s*=/m.test(content)) {
      content += `${content.endsWith("\n") ? "" : "\n"}VITE_SITE_URL=http://localhost:3000\n`;
    }
    await writeFile(file, content, { mode: 0o600 });
    console.log(`Configured ${path}`);
  }
  console.log(
    "Run pnpm dev for web + backend, and pnpm dev:mobile in another terminal for Expo Go.",
  );
}

configure().catch((error) => {
  console.error(`Dev setup failed: ${error.message}`);
  console.error(
    "Run pnpm dev:setup to configure a Convex development deployment first.",
  );
  process.exitCode = 1;
});
