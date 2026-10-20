import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

export const convexSiteUrl = (import.meta.env.VITE_CONVEX_SITE_URL ?? process.env.VITE_CONVEX_SITE_URL) as string;

export const { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } =
  convexBetterAuthReactStart({
    convexUrl: (import.meta.env.VITE_CONVEX_URL ?? process.env.VITE_CONVEX_URL) as string,
    convexSiteUrl,
  });

/**
 * Forward a GET to an authenticated Convex HTTP route with the caller's
 * session token. Used for private media and export downloads so the browser
 * only ever sees same-origin URLs that require the session cookie.
 */
export async function proxyAuthenticated(path: string, cacheControl: string) {
  const token = await getToken();
  if (!token) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const upstream = await fetch(`${convexSiteUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-disposition",
    "x-content-type-options",
    "content-security-policy",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Per-account bytes: never cacheable by shared caches, whatever upstream says.
  headers.set("cache-control", upstream.ok ? cacheControl : "no-store");
  headers.set("vary", "Cookie");
  return new Response(upstream.body, { status: upstream.status, headers });
}
