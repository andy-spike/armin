import manifest from "./kit-manifest.json";

export const ANKI_KIT = {
  version: manifest.version,
  artifact: manifest.artifact,
  sha256: manifest.sha256,
  bytes: manifest.bytes,
  path: `/anki-kit/${manifest.artifact}`,
  runtime: "Node.js 20, 22, or 24",
  testedRuntime: "Node.js 24 on Linux x64",
  command: `node armin-anki-kit.mjs <file> --out <folder>`,
} as const;
