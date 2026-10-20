import { useEffect, useState } from "react";
import { ConvexError } from "convex/values";
import { useNetworkState } from "expo-network";

export function errorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (data?.message) return data.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function newRequestId() {
  return crypto.randomUUID();
}

/** A clock for time-dependent queries, so due reviews appear without writes. */
export function useNow(stepMs = 30_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / stepMs) * stepMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / stepMs) * stepMs), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

/** False only when the OS reports no connection; unknown counts as online. */
export function useOnline() {
  const network = useNetworkState();
  return network.isConnected !== false && network.isInternetReachable !== false;
}
