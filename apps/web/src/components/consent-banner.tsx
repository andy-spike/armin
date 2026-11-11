import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { setAnalyticsConsent, startAnalytics, useAnalyticsConsent } from "@/lib/analytics";

export function ConsentBanner() {
  const consent = useAnalyticsConsent();

  useEffect(() => {
    startAnalytics();
  }, []);

  if (consent !== "pending") return null;
  return <Banner />;
}

function Banner() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--consent-inset", `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--consent-inset");
    };
  }, []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 text-[0.8125rem] leading-snug text-ink">
          Armin uses PostHog to count visits and report errors. It never sees your cards. Allow a
          cookie to link your visits, or decline to be counted without one.{" "}
          <Link
            to="/privacy"
            className="whitespace-nowrap text-muted underline underline-offset-2 hover:text-ink"
          >
            Privacy policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2 max-sm:[&>*]:flex-1">
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
