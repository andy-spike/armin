import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@armin/backend/api";
import { convexClient } from "@/lib/armin-client";

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

type Connection = { online: boolean; pending: boolean };

let cached: Connection = { online: true, pending: false };

function readConnection(): Connection {
  try {
    const state = convexClient().connectionState();
    const browserOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    // The socket can take up to a minute to notice a dead network; the
    // browser's own offline signal pauses submissions immediately.
    const online = browserOnline && (state.isWebSocketConnected || !state.hasEverConnected);
    const pending = state.hasInflightRequests;
    if (online !== cached.online || pending !== cached.pending) {
      cached = { online, pending };
    }
  } catch {
    // Client not ready during the first render.
  }
  return cached;
}

/**
 * Live connection state. `online` is false while the WebSocket is down, so
 * the UI can stop new study/edit submissions; `pending` means a submitted
 * request has no confirmed outcome yet.
 */
export function useConnection() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      let unsubscribe: () => void = () => undefined;
      try {
        unsubscribe = convexClient().subscribeToConnectionState(onChange);
      } catch {
        // Client not ready yet; browser events still drive the state.
      }
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
        unsubscribe();
      };
    },
    readConnection,
    () => cached,
  );
}

/** A clock that ticks every `stepMs`, aligned to the step boundary. */
export function useNow(stepMs = 30_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / stepMs) * stepMs);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / stepMs) * stepMs);
    const id = window.setInterval(tick, Math.min(stepMs, 15_000));
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [stepMs]);
  return now;
}
