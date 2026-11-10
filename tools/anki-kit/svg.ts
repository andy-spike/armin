/**
 * Draw an SVG from an Anki package into a PNG for the converter kit.
 *
 * Same size rule as the browser (`svgRasterSize`): an SVG is never stored, and
 * the PNG is content-addressed like every other media file. resvg
 * renders locally: it never runs scripts or fetches images or fonts. System
 * fonts are disabled and the kit ships Inter, so text renders deterministically
 * instead of depending on the machine.
 */

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

/** XML declarations and doctypes can't appear inside the wrapper SVG. */
function stripProlog(svg: string) {
  return svg
    .replace(/^\uFEFF?\s*<\?xml[^>]*\?>/i, "")
    .replace(/^\s*<!DOCTYPE[^>]*>/i, "")
    .trim();
}

/**
 * Wrap the source in a viewport of exactly the size the browser would draw, so
 * fractional scaling rounds the same way instead of relying on resvg's fit.
 */
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
        // The wrapper fixes the viewport; refuse anything that doesn't match it.
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
