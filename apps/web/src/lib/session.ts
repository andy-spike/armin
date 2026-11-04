import { useSyncExternalStore } from "react";
import { onlineManager, useQuery } from "@tanstack/react-query";
import { useConvexConnectionState } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@armin/backend/api";

/** The signed-in user and library state; reactive. */
export function useViewer() {
  return useQuery({ ...convexQuery(api.account.viewer, {}), retry: false });
}

/** True once the signed-in, verified user has an active library. */
export function useLibraryReady() {
  const viewer = useViewer();
  return viewer.data?.library?.status === "active" && viewer.data.emailVerified;
}

/**
 * Which optional auth services (email delivery, Google) this deployment has
 * configured. Auth pages are signed out, where the websocket client waits for
 * auth (`expectAuth`); this public read goes over the HTTP API instead.
 */
const publicConvex = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL as string);

export function useAuthFeatures() {
  return useQuery({
    queryKey: ["auth", "features"],
    queryFn: () => publicConvex.query(api.account.authFeatures, {}),
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Live connection state. `online` is false while the WebSocket is down, so
 * the UI can stop new study/edit submissions; `pending` means a submitted
 * request has no confirmed outcome yet.
 */
export function useConnection() {
  const state = useConvexConnectionState();
  // The socket can take up to a minute to notice a dead network; the
  // browser's own offline signal (TanStack Query's online manager) pauses
  // submissions immediately.
  const browserOnline = useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
  return {
    online: browserOnline && (state.isWebSocketConnected || !state.hasEverConnected),
    pending: state.hasInflightRequests,
  };
}
