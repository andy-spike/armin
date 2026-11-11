/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useMatches,
  useRouteContext,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import type { ConvexQueryClient } from "@convex-dev/react-query";
import appCss from "@/styles/app.css?url";
import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import sourceSerifLatin from "@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import { ThemeProvider } from "@/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { KeybindingsProvider } from "@/keybindings/keybindings-provider";
import { RouteNotFound } from "@/components/route-status";

const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return (await getToken()) ?? null;
});

type AuthContext = { isAuthenticated: boolean; token: string | null };

let browserAuth: Promise<AuthContext> | null = null;

async function loadAuth(convexQueryClient: ConvexQueryClient): Promise<AuthContext> {
  const token = await getAuth();
  if (token) convexQueryClient.serverHttpClient?.setAuth(token);
  return { isAuthenticated: Boolean(token), token };
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "color-scheme", content: "light dark" },
      { title: "Armin" },
    ],
    links: [
      {
        rel: "preload",
        href: interLatin,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: sourceSerifLatin,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [{ src: "/theme-init.js" }],
  }),
  beforeLoad: (ctx) => {
    if (typeof window === "undefined") {
      if (
        ctx.matches.some((match) =>
          ["/privacy", "/terms", "/docs/mcp", "/pricing"].includes(match.routeId),
        )
      ) {
        return { isAuthenticated: false, token: null };
      }
      return loadAuth(ctx.context.convexQueryClient);
    }
    browserAuth ??= loadAuth(ctx.context.convexQueryClient).then(
      (auth) => {
        if (!auth.isAuthenticated) browserAuth = null;
        return auth;
      },
      (error: unknown) => {
        browserAuth = null;
        throw error;
      },
    );
    return browserAuth;
  },
  ssr: true,
  headers: () => ({
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000",
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <>
      <title>Page not found · Armin</title>
      <RouteNotFound />
    </>
  ),
  component: RootComponent,
});

function RootComponent() {
  const context = useRouteContext({ from: Route.id });
  if (typeof window !== "undefined" && !browserAuth && context.isAuthenticated) {
    // oxlint-disable-next-line react/globals
    browserAuth = Promise.resolve({ isAuthenticated: true, token: context.token });
  }
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient as never}
      initialToken={context.token}
    >
      <QueryClientProvider client={context.queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <KeybindingsProvider>
              <Outlet />
            </KeybindingsProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const documentScroll = useMatches({
    select: (matches) =>
      matches.some(
        (match) =>
          match.staticData.documentScroll ||
          (match.context as { landing?: boolean } | undefined)?.landing,
      ),
  });
  return (
    <html
      lang="en"
      data-theme="light"
      data-scroll={documentScroll ? "document" : undefined}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
