"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const AI_FEATURES = [
  "AI hints that respect your prerequisites",
  "Explain-this-card answers from your own deck",
  "Suggested new cards from your study history",
];

export function BillingPage() {
  const { data: sub } = useQuery({
    queryKey: queryKeys.subscription,
    queryFn: () => api.getSubscription(),
  });

  const [upgraded, setUpgraded] = useState(false);

  const upgrade = useMutation({
    mutationFn: () => api.upgradeToPro(),
    onSuccess: () => {
      setUpgraded(true);
    },
  });

  if (!sub) {
    return (
      <section className="flex min-h-[50vh] items-center justify-center">
        <p className="font-mono text-xs text-[var(--color-muted)]">
          loading billing…
        </p>
      </section>
    );
  }

  const isPro = sub.plan === "pro";

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-8">
      <header>
        <h1 className="font-serif text-3xl text-[var(--color-text)]">
          Billing
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          All study features are free. The AI plan is five dollars a month.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <PlanCard
          name="Free"
          price="$0"
          features={[
            "Unlimited decks and cards",
            "Spaced repetition & prerequisite locks",
            "Cram sessions, browse, graph",
            `${sub.aiAllowanceMonthly} AI actions a month`,
          ]}
          current={!isPro}
        />
        <PlanCard
          name="AI help"
          price="$5/mo"
          features={AI_FEATURES}
          current={isPro}
          cta={
            !isPro ? (
              <Button
                variant="primary"
                size="md"
                busy={upgrade.isPending}
                onClick={() => upgrade.mutate()}
              >
                <Sparkles className="h-4 w-4" />
                Upgrade
              </Button>
            ) : undefined
          }
          highlighted
        />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-[var(--color-surface-strong)] p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-[var(--color-text)]">
            AI allowance
          </p>
          <p className="font-mono text-xs text-[var(--color-muted)]">
            {sub.aiAllowanceUsed} / {sub.aiAllowanceMonthly} this month
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all"
            style={{
              width: `${Math.min(100, (sub.aiAllowanceUsed / sub.aiAllowanceMonthly) * 100)}%`,
            }}
          />
        </div>
        {isPro && (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-good)]">
            <Check className="h-3.5 w-3.5" />
            Plan active
            {sub.currentPeriodEnd &&
              ` · renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}
          </p>
        )}
      </section>

      <p className="text-xs text-[var(--color-muted)]">
        Payments run through Polar. You can cancel anytime — your study data
        stays on the free tier.
      </p>
      {upgraded && !isPro && (
        <p className="sr-only">Mock upgrade applied</p>
      )}
    </section>
  );
}

function PlanCard({
  name,
  price,
  features,
  current,
  highlighted = false,
  cta,
}: {
  name: string;
  price: string;
  features: string[];
  current: boolean;
  highlighted?: boolean;
  cta?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-5",
        highlighted
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
          : "border-[var(--color-surface-strong)]",
      )}
    >
      <div className="flex items-baseline justify-between">
        <p className="font-serif text-lg text-[var(--color-text)]">{name}</p>
        <p className="font-mono text-sm text-[var(--color-muted)]">{price}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-xs leading-relaxed text-[var(--color-muted)]"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-good)]" />
            {f}
          </li>
        ))}
      </ul>
      {current ? (
        <p className="mt-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-good)]">
          <Check className="h-3 w-3" />
          Current plan
        </p>
      ) : (
        <div className="mt-auto">{cta}</div>
      )}
    </div>
  );
}
