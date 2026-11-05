import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useBillingStatus } from "@/components/billing-settings";
import { useViewer } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Whether the signed-in library may use concept cards (ADR 0023): Pro only,
 * which the backend already resolves for complimentary Pro and self-hosted
 * instances. Undefined while the viewer loads, so callers neither upsell nor
 * unlock before they know.
 */
export function useConceptCardsAllowed() {
  const plan = useViewer().data?.library?.plan;
  return plan === undefined ? undefined : plan === "pro";
}

/**
 * Where a learner gets Pro: Billing settings where this deployment sells it,
 * otherwise the plans page (for example the shared reviewer account).
 */
export function ProUpgradeLink({ className }: { className?: string }) {
  const billing = useBillingStatus().data;
  const linkClass = cn("font-medium text-accent hover:text-accent-deep", className);
  return billing?.enabled ? (
    <Link to="/settings" search={{ tab: "billing" }} className={linkClass}>
      Upgrade in Billing
    </Link>
  ) : (
    <Link to="/pricing" className={linkClass}>
      See plans
    </Link>
  );
}

/** The small "Pro" marker on a feature a free library can't use. */
export function ProMarker({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm bg-accent/15 px-1 text-[0.6875rem] font-semibold leading-4 text-accent-deep",
        className,
      )}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      Pro
    </span>
  );
}

/**
 * Explains that concept cards need Pro: in the card editor when a free
 * learner picks the Concept type (`create`), or opens a concept card kept
 * from a lapsed Pro plan (`lapsed`).
 */
export function ConceptProNotice({ variant }: { variant: "create" | "lapsed" }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-deep" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-ink">
          {variant === "create" ? "Concept cards are a Pro feature" : "This concept card needs Pro"}
        </p>
        <p className="text-muted">
          {variant === "create"
            ? "Practice a skill instead of one answer: Armin generates a new exercise with a worked solution for every review."
            : "Its template, exercises, and review history are kept. It returns to your reviews, and can be edited again, when you upgrade."}
        </p>
        <ProUpgradeLink className="inline-block text-sm" />
      </div>
    </div>
  );
}
