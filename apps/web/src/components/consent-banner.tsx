import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { setAnalyticsConsent, startAnalytics, useAnalyticsConsent } from "@/lib/analytics";

export function ConsentBanner() {
  const consent = useAnalyticsConsent();

  useEffect(() => {
    startAnalytics();
  }, []);

  if (consent !== "pending") return null;
  return (
    <div
      role="region"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
    >
      <div className="flex w-full max-w-2xl flex-col gap-3 border border-border bg-surface px-4 py-3 shadow-lg sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-ink">
          Armin uses PostHog to count visits and report errors. Allow a cookie so visits link up, or
          decline and visits are counted without one. Card content is never sent.{" "}
          <Link to="/privacy" className="underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnalyticsConsent(false)}>
            Decline
          </Button>
          <Button size="sm" onClick={() => setAnalyticsConsent(true)}>
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}
