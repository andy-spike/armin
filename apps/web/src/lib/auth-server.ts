import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

export const convexSiteUrl = (import.meta.env.VITE_CONVEX_SITE_URL ??
  process.env.VITE_CONVEX_SITE_URL) as string;

export const { handler, getToken } = convexBetterAuthReactStart({
  convexUrl: (import.meta.env.VITE_CONVEX_URL ?? process.env.VITE_CONVEX_URL) as string,
  convexSiteUrl,
  jwtCache: {
    enabled: true,
    expirationToleranceSeconds: -60,
    isAuthError: (error) => /unauthenticated|unauthorized|jwt|token/i.test(String(error)),
  },
});

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
  headers.set("cache-control", upstream.ok ? cacheControl : "no-store");
  headers.set("vary", "Cookie");
  return new Response(upstream.body, { status: upstream.status, headers });
}
