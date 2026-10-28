import manifest from "./kit-manifest.json";

/**
 * The portable converter kit served with the web app. The build script verifies
 * that the generated archive matches this manifest; changing converter or kit
 * source therefore requires a new version and checksum.
 */
export const ANKI_KIT = {
  version: manifest.version,
  artifact: manifest.artifact,
  sha256: manifest.sha256,
  bytes: manifest.bytes,
  path: `/anki-kit/${manifest.artifact}`,
  /** Tested runtime. Node 20 and 22 are supported by the code, but not proven here. */
  runtime: "Node.js 20, 22, or 24",
  testedRuntime: "Node.js 24 on Linux x64",
  command: `node armin-anki-kit.mjs <file> --out <folder>`,
} as const;
