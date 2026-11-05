import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "@armin/backend/api";
import { Section } from "@/components/settings-layout";

const number = new Intl.NumberFormat("en-US");

/** The day a monthly allowance resets. Allowances follow the UTC month, so this is shown in UTC. */
export function formatAllowanceReset(resetsAt: number) {
  return new Date(resetsAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * This month's generated concept card variants against the plan's monthly
 * allowance. Hidden where no allowance applies (a self-hosted instance).
 */
export function VariantUsage() {
  const allowance = useQuery(convexQuery(api.concepts.allowance, {})).data;
  if (allowance === null) return null;
  const used = allowance ? allowance.used + allowance.reserved : 0;
  const limit = allowance?.limit ?? 0;
  const left = Math.max(0, limit - used);

  return (
    <Section
      title="Practice variants"
      description="Concept cards practice with generated exercises. Each one counts toward a monthly allowance that resets on the first of the month (UTC)."
      action={
        allowance?.plan === "free" ? (
          <Link
            to="/pricing"
            className="text-[0.8125rem] font-medium text-accent hover:text-accent-deep"
          >
            See plans
          </Link>
        ) : undefined
      }
    >
      <div className="px-4 py-3.5">
        {!allowance ? (
          <p className="text-sm text-muted">Loading usage…</p>
        ) : limit === 0 ? (
          <p className="text-sm text-muted">
            Your plan doesn't include generated variants. Concept cards keep the variants they
            already have.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">
              <span className="font-medium tabular-nums">{number.format(used)}</span>
              <span className="text-muted"> of {number.format(limit)} used this month</span>
            </p>
            <div
              className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-border"
              role="meter"
              aria-label="Practice variants used this month"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(used, limit)}
              aria-valuetext={`${number.format(used)} of ${number.format(limit)}`}
            >
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>
            <p className="mt-3 border-t border-border pt-3 text-[0.8125rem] text-muted">
              {left === 0
                ? `This month's allowance is used. New variants resume on ${formatAllowanceReset(allowance.resetsAt)}; until then, reviews reuse each card's variants.`
                : `${number.format(left)} left. Resets on ${formatAllowanceReset(allowance.resetsAt)}.`}
            </p>
          </>
        )}
      </div>
    </Section>
  );
}
