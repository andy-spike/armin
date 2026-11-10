import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const clientDir = join(root, "client");
const { default: app } = await import(new URL("./dist/server/server.js", import.meta.url).href);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const contentTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tgz": "application/gzip",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".zip": "application/zip",
};

async function staticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) return undefined;
  const file = normalize(join(clientDir, decoded));
  if (!file.startsWith(clientDir + sep)) return undefined;
  try {
    const info = await stat(file);
    return info.isFile() ? { file, size: info.size } : undefined;
  } catch {
    return undefined;
  }
}

async function serveStatic(req, res, { file, size }, pathname) {
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[extname(file)] ?? "application/octet-stream");
  res.setHeader("Content-Length", size);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Cache-Control",
    pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300",
  );
  if (req.method === "HEAD") return res.end();
  await pipeline(createReadStream(file), res);
}

function toRequest(req, signal) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto === "https" ? "https" : "http";
  const url = new URL(req.url ?? "/", `${protocol}://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name.startsWith(":")) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
    signal,
  });
}

async function sendResponse(res, response) {
  res.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name === "set-cookie") continue;
    res.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("set-cookie", cookies);
  if (!response.body) return res.end();
  await pipeline(Readable.fromWeb(response.body), res);
}

const server = createServer(async (req, res) => {
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      if (pathname !== "/") {
        const found = await staticFile(pathname);
        if (found) return await serveStatic(req, res, found, pathname);
      }
    }
    await sendResponse(res, await app.fetch(toRequest(req, abort.signal)));
  } catch (error) {
    if (abort.signal.aborted) return;
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Internal Server Error");
    } else {
      res.destroy();
    }
  }
});

server.listen(port, host, () => console.log(`Armin web listening on http://${host}:${port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
