import { useSyncExternalStore } from "react";
import { onlineManager, useQuery } from "@tanstack/react-query";
import { useConvexConnectionState } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@armin/backend/api";

export function useViewer() {
  return useQuery({ ...convexQuery(api.account.viewer, {}), retry: false });
}

export function useLibraryReady() {
  const viewer = useViewer();
  return viewer.data?.library?.status === "active" && viewer.data.emailVerified;
}

const publicConvex = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL as string);

export function useAuthFeatures() {
  return useQuery({
    queryKey: ["auth", "features"],
    queryFn: () => publicConvex.query(api.account.authFeatures, {}),
    staleTime: Infinity,
    retry: false,
  });
}

export function useConnection() {
  const state = useConvexConnectionState();
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
