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
import xyflowCss from "@xyflow/react/dist/style.css?url";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import { ThemeProvider } from "@/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { KeybindingsProvider } from "@/keybindings/keybindings-provider";
import { LibrarySync } from "@/components/library-sync";

/** Read the Better Auth session cookie on the server and mint a Convex token. */
const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return (await getToken()) ?? null;
});

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
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: xyflowCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
    scripts: [{ src: "/theme-init.js" }],
  }),
  beforeLoad: async (ctx) => {
    const token = await getAuth();
    if (token) ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    return { isAuthenticated: Boolean(token), token };
  },
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  const context = useRouteContext({ from: Route.id });
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
