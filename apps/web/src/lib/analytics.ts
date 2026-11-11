import { useSyncExternalStore } from "react";
import type { CaptureResult, PostHog, Properties } from "posthog-js";
import { selfHosted } from "@/lib/self-host";

export type AnalyticsConsent = "granted" | "denied" | "pending";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

export const analyticsEnabled = !selfHosted && Boolean(key);

let client: Promise<PostHog | null> | null = null;
let consent: AnalyticsConsent | null = null;
const listeners = new Set<() => void>();

function publishConsent(posthog: PostHog) {
  consent = posthog.get_explicit_consent_status();
  for (const listener of listeners) listener();
}

function withoutQuery(value: unknown) {
  if (typeof value !== "string" || !/^https?:\/\//.test(value)) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function scrub(properties: Properties | undefined) {
  if (!properties) return properties;
  const clean: Properties = {};
  for (const [name, value] of Object.entries(properties)) {
    if (name === "title" || name === "$title") continue;
    clean[name] = withoutQuery(value);
  }
  return clean;
}

function scrubEvent(event: CaptureResult | null) {
  if (!event) return null;
  return {
    ...event,
    properties: scrub(event.properties) ?? {},
    $set: scrub(event.$set),
    $set_once: scrub(event.$set_once),
  };
}

export function startAnalytics() {
  if (client || !analyticsEnabled || typeof window === "undefined") return;
  client = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key as string, {
        api_host: host,
        defaults: "2026-05-30",
        cookieless_mode: "on_reject",
        capture_exceptions: true,
        person_profiles: "identified_only",
        disable_session_recording: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        before_send: scrubEvent,
      });
      publishConsent(posthog);
      return posthog;
    })
    .catch(() => null);
}

export function useAnalyticsConsent() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => consent,
    () => null,
  );
}

export function setAnalyticsConsent(allow: boolean) {
  void client?.then((posthog) => {
    if (!posthog) return;
    if (allow) posthog.opt_in_capturing();
    else posthog.opt_out_capturing();
    publishConsent(posthog);
  });
}

export function identifyAnalytics(userId: string) {
  void client?.then((posthog) => {
    if (posthog?.get_explicit_consent_status() === "granted") posthog.identify(userId);
  });
}

export function captureError(error: unknown) {
  void client?.then((posthog) => posthog?.captureException(error));
}

export async function resetAnalytics() {
  const posthog = await client;
  if (!posthog) return;
  const status = posthog.get_explicit_consent_status();
  posthog.reset();
  if (status === "granted") posthog.opt_in_capturing({ captureEventName: false });
  if (status === "denied") posthog.opt_out_capturing();
}
