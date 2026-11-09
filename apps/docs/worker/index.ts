/**
 * Markdown at page URLs, for AI agents.
 *
 * The site is static: the build writes every page's HTML and, beside it, a
 * Markdown version at `/<slug>/index.md`. This Worker sits in front of those
 * files. A request whose `Accept` header prefers Markdown gets the page's
 * Markdown at the page's own URL, so an agent never needs to know the `.md`
 * convention; everyone else gets the HTML exactly as before. Responses that
 * negotiate carry `Vary: Accept`, so caches keep the two forms apart, and HTML
 * pages advertise their Markdown version in a `Link` header.
 *
 * It serves the Markdown Nimbus builds (the same as `index.md`, `llms.txt`
 * and Copy page), with no conversion and no server rendering, so pages stay
 * prerendered. `wrangler.jsonc` routes only page-like paths through it.
 */

interface Env {
  /** Workers Static Assets: the built `dist/` folder. */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const MARKDOWN_TYPES = new Set(["text/markdown", "text/x-markdown"]);
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml", "text/*", "*/*"]);

/**
 * True when the `Accept` header asks for Markdown at least as strongly as for
 * HTML or a wildcard. Browsers never name `text/markdown`, so a client that
 * does (`text/markdown, text/html, *\/*`, as several agents send) gets
 * Markdown on a tie, while a browser's `text/html,…,*\/*;q=0.8` keeps HTML.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  let markdown = 0;
  let html = 0;
  for (const part of accept.split(",")) {
    const [rawType, ...params] = part.trim().split(";");
    const type = rawType?.trim().toLowerCase() ?? "";
    let quality = 1;
    for (const param of params) {
      const [key, value] = param.trim().split("=");
      if (key?.trim().toLowerCase() === "q") {
        const parsed = Number(value);
        quality = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
      }
    }
    if (MARKDOWN_TYPES.has(type)) markdown = Math.max(markdown, quality);
    else if (HTML_TYPES.has(type)) html = Math.max(html, quality);
  }
  return markdown > 0 && markdown >= html;
}

/** A page path's Markdown file, or null for files and agent endpoints. */
function markdownPathFor(pathname: string): string | null {
  const last = pathname.split("/").pop() ?? "";
  // `/llms.txt`, `/index.md`, images, and other files are served as they are.
  if (last.includes(".")) return null;
  return pathname.endsWith("/") ? `${pathname}index.md` : `${pathname}/index.md`;
}

function withHeaders(
  response: Response,
  headers: Record<string, string>,
  status = response.status,
): Response {
  const next = new Response(response.body, {
    status,
    statusText: response.statusText,
    headers: response.headers,
  });
  for (const [name, value] of Object.entries(headers)) {
    if (name === "Vary") {
      const vary = next.headers.get("Vary");
      next.headers.set(
        "Vary",
        vary && !/\baccept\b/i.test(vary) ? `${vary}, Accept` : (vary ?? "Accept"),
      );
    } else if (name === "Link") {
      // Keep the homepage's agent-discovery links from `_headers`.
      next.headers.append("Link", value);
    } else {
      next.headers.set(name, value);
    }
  }
  return next;
}

function notFoundMarkdown(url: URL): Response {
  const body = [
    "# Page not found",
    "",
    `There is no page at ${url.pathname} in the Armin docs.`,
    "",
    `- Index of every page: ${url.origin}/llms.txt`,
    `- Every page in one file: ${url.origin}/llms-full.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    status: 404,
    headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const markdownPath = markdownPathFor(url.pathname);

    if (!markdownPath || (request.method !== "GET" && request.method !== "HEAD")) {
      return env.ASSETS.fetch(request);
    }

    if (prefersMarkdown(request.headers.get("Accept"))) {
      const markdown = await env.ASSETS.fetch(
        new Request(new URL(markdownPath, url), {
          method: request.method,
          headers: request.headers,
        }),
      );
      if (!markdown.ok) return notFoundMarkdown(url);
      return withHeaders(markdown, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Location": markdownPath,
        Vary: "Accept",
      });
    }

    const page = await env.ASSETS.fetch(request);
    if (!page.ok || !page.headers.get("Content-Type")?.includes("text/html")) return page;
    // The homepage's `_headers` rule already links its Markdown version.
    const linked = /type="text\/markdown"/.test(page.headers.get("Link") ?? "");
    return withHeaders(
      page,
      linked
        ? { Vary: "Accept" }
        : { Link: `<${markdownPath}>; rel="alternate"; type="text/markdown"`, Vary: "Accept" },
    );
  },
};
