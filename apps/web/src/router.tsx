import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexProvider } from "convex/react";
import { routeTree } from "./routeTree.gen";
import { setConvexClient } from "@/lib/armin-client";
import { RouteError, RouteNotFound } from "@/components/route-status";

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (!convexUrl) throw new Error("VITE_CONVEX_URL is not set");

  const convexQueryClient = new ConvexQueryClient(convexUrl, { expectAuth: true });
  setConvexClient(convexQueryClient.convexClient);

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        staleTime: 5_000,
        refetchOnWindowFocus: true,
        retry: false,
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    context: { queryClient, convexQueryClient },
    scrollRestoration: true,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
    Wrap: ({ children }) => (
      <ConvexProvider client={convexQueryClient.convexClient}>{children}</ConvexProvider>
    ),
  });

  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
