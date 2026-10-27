import katex from "katex";
import "katex/contrib/mhchem";

const cache = new Map<string, { html: string; error: string | null }>();

/** Only KaTeX-generated markup is trusted. Each expression gets fresh macros. */
export function renderMath(tex: string, display: boolean) {
  const key = `${display ? "display" : "inline"}:${tex}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  let result;
  try {
    result = {
      html: katex.renderToString(tex, {
        displayMode: display,
        output: "htmlAndMathml",
        throwOnError: true,
        trust: false,
        strict: "ignore",
        maxExpand: 1000,
        maxSize: 20,
        macros: {},
      }),
      error: null,
    };
  } catch {
    result = { html: "", error: "This equation uses invalid or unsupported math syntax." };
  }
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
