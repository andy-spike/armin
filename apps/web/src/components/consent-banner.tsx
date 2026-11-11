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
      className="fixed right-4 bottom-4 left-4 z-50 rounded-lg border border-border bg-surface p-3.5 shadow-overlay transition-[opacity,translate] duration-250 ease-(--ease-out) starting:translate-y-2 starting:opacity-0 sm:left-auto sm:w-72"
    >
      <p className="text-[0.8125rem] leading-snug text-ink">
        Allow an analytics cookie? Your cards are never sent.{" "}
        <Link to="/privacy" className="text-muted underline underline-offset-2 hover:text-ink">
          Privacy
        </Link>
      </p>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setAnalyticsConsent(false)}>
          Decline
        </Button>
        <Button size="sm" onClick={() => setAnalyticsConsent(true)}>
          Allow
        </Button>
      </div>
    </div>
  );
}
