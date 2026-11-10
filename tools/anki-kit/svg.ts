import { readFile } from "node:fs/promises";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { svgRasterSize } from "../../packages/core/src/media";

let wasm: Promise<void> | null = null;
let font: Promise<Uint8Array> | null = null;

function loadWasm() {
  wasm ??= initWasm(readFile(new URL("./resvg-wasm.wasm", import.meta.url))).catch((error) => {
    wasm = null;
    throw error;
  });
  return wasm;
}

function loadFont() {
  font ??= readFile(new URL("./resvg-font.woff2", import.meta.url)).catch((error) => {
    font = null;
    throw error;
  });
  return font;
}

function renderOptions(fontData: Uint8Array) {
  const font = {
    fontBuffers: [fontData],
    loadSystemFonts: false,
    defaultFontFamily: "Inter",
    sansSerifFamily: "Inter",
  };
  return { font };
}

function stripProlog(svg: string) {
  return svg
    .replace(/^\uFEFF?\s*<\?xml[^>]*\?>/i, "")
    .replace(/^\s*<!DOCTYPE[^>]*>/i, "")
    .trim();
}

function sizedSvg(
  svg: string,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    ` viewBox="0 0 ${sourceWidth} ${sourceHeight}" preserveAspectRatio="xMidYMid meet">`,
    svg,
    "</svg>",
  ].join("");
}

export async function rasterizeSvg(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    await loadWasm();
    const options = renderOptions(await loadFont());
    const svg = stripProlog(new TextDecoder().decode(bytes));
    const probe = new Resvg(svg, options);
    const { sourceWidth, sourceHeight, width, height } = svgRasterSize(probe.width, probe.height);
    probe.free();
    const renderer = new Resvg(sizedSvg(svg, width, height, sourceWidth, sourceHeight), {
      ...options,
      fitTo: { mode: "original" },
    });
    try {
      const image = renderer.render();
      try {
        return image.width === width && image.height === height ? image.asPng() : null;
      } finally {
        image.free();
      }
    } finally {
      renderer.free();
    }
  } catch {
    return null;
  }
}
