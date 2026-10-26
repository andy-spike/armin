/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
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
import { LibrarySync } from "@/components/library-sync";
import { RouteNotFound } from "@/components/route-status";

/** Read the Better Auth session cookie on the server and mint a Convex token. */
const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return (await getToken()) ?? null;
});

type AuthContext = { isAuthenticated: boolean; token: string | null };

/**
 * The browser's signed-in state, remembered across client navigations so each
 * click doesn't wait on a server round trip. It can't go stale: every sign-in,
 * sign-out, reset, and account deletion is a full page load, which clears it,
 * and the Convex client refreshes its own tokens. A session that ends elsewhere
 * shows up through the viewer query instead. Holding the promise lets the
 * router's back-to-back loads at startup share one request; signed-out and
 * failed results are dropped, so the auth pages always ask the server.
 */
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
      // The stylesheet only reveals these fonts once parsed; preloading the
      // Latin files used above the fold starts them with the document instead.
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
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
    scripts: [{ src: "/theme-init.js" }],
  }),
  beforeLoad: (ctx) => {
    if (typeof window === "undefined") {
      // Legal HTML is publicly cached: never read cookies or serialize a session token.
      if (ctx.matches.some((match) => match.routeId === "/privacy" || match.routeId === "/terms")) {
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
  // Server-render the providers so the signed-in frame below can render too;
  // routes that don't opt in still render only in the browser (`src/start.ts`).
  ssr: true,
  // A signed-in page carries the viewer's Convex token for hydration, so no
  // shared cache may keep a copy.
  headers: () => ({ "Cache-Control": "private, no-store" }),
  shellComponent: RootDocument,
  // React hoists this title for the unmatched-URL page, which has no route
  // of its own to carry a `head`.
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
  // A server-rendered load ran `beforeLoad` on the server, so the browser
  // starts out remembering that answer instead of asking again on first click.
  // `browserAuth` is a module-level cache shared across renders by design.
  if (typeof window !== "undefined" && !browserAuth && context.isAuthenticated) {
    // oxlint-disable-next-line react/globals
    browserAuth = Promise.resolve({ isAuthenticated: true, token: context.token });
  }
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      // The provider's AuthClient type collapses the session type under this
      // monorepo's mixed Better Auth installs; the runtime client is the
      // documented `createAuthClient({ plugins: [convexClient()] })`.
      authClient={authClient as never}
      initialToken={context.token}
    >
      <QueryClientProvider client={context.queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <KeybindingsProvider>
              <LibrarySync />
              <Outlet />
            </KeybindingsProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
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
