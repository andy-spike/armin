import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api } from "@armin/backend/api";
import { PLAN_LIMITS, PLAN_PRICES } from "@armin/core/plans";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { Row, Section } from "@/components/settings-layout";
import { armin, errorMessage } from "@/lib/armin-client";
import { useConnection } from "@/lib/session";

type Interval = "month" | "year";

const number = new Intl.NumberFormat("en-US");

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: "month", label: `Monthly · $${PLAN_PRICES.pro.monthlyUsd}` },
  { value: "year", label: `Yearly · $${PLAN_PRICES.pro.yearlyUsd}` },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

/** Whether this deployment sells plans to the signed-in user. */
export function useBillingStatus() {
  return useQuery(convexQuery(api.billing.status, {}));
}

/**
 * The account's plan and Pro subscription. Checkout and the customer portal
 * are Polar's hosted pages; the portal handles cancelling, switching between
 * monthly and yearly, cards, and invoices.
 */
export function BillingSettings() {
  const toast = useToast();
  const { online } = useConnection();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { checkout?: string; interval?: Interval };
  const status = useBillingStatus();
  const [interval, setInterval] = useState<Interval>(search.interval ?? "month");

  const refresh = useMutation({
    mutationFn: () => armin.billing.refresh(),
    onError: (error) =>
      toast({ tone: "error", title: "Couldn't check your plan", description: errorMessage(error) }),
  });

  // Polar's checkout returns here with `checkout=success`. That marker is
  // not proof of payment: the page waits until the synced plan is Pro before
  // announcing it, and offers Retry if confirmation doesn't arrive.
  const [awaitingPro] = useState(() => search.checkout === "success");
  const [slow, setSlow] = useState(false);
  const startedReturn = useRef(false);
  useEffect(() => {
    if (!awaitingPro || startedReturn.current) return;
    startedReturn.current = true;
    refresh.mutate();
    void navigate({ to: "/settings", search: { tab: "billing" }, replace: true });
  }, [awaitingPro, refresh, navigate]);
  useEffect(() => {
    if (!awaitingPro) return;
    const timer = window.setTimeout(() => setSlow(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [awaitingPro]);

  const plan = status.data?.plan;
  const announced = useRef(false);
  useEffect(() => {
    if (!awaitingPro || plan !== "pro" || announced.current) return;
    announced.current = true;
    toast({
      tone: "success",
      title: "Welcome to Pro",
      description: "Thanks for supporting Armin. Your new limits apply now.",
    });
  }, [awaitingPro, plan, toast]);

  const checkout = useMutation({
    mutationFn: async (selected: Interval) => {
      const { url } = await armin.billing.createCheckout(selected);
      // Polar's hosted checkout returns to Billing with `checkout=success`.
      window.location.assign(url);
    },
    onError: (error) =>
      toast({ tone: "error", title: "Couldn't open checkout", description: errorMessage(error) }),
  });

  const portal = useMutation({
    mutationFn: async () => {
      const { url } = await armin.billing.createPortalSession();
      window.location.assign(url);
    },
    onError: (error) =>
      toast({
        tone: "error",
        title: "Couldn't open subscription settings",
        description: errorMessage(error),
      }),
  });

  const data = status.data;
  if (!data?.enabled) return null;
  const subscription = data.subscription;
  const pro = data.plan === "pro";
  const pending = awaitingPro && !pro;
  const unconfirmed = slow || data.syncFailed || refresh.isError;

  return (
    <Section
      title="Plan"
      description="Payments, taxes, and invoices are handled by Polar, Armin's merchant of record."
    >
      <Row
        label={pro ? "Pro" : "Free"}
        hint={
          pro
            ? `Up to ${number.format(PLAN_LIMITS.pro.flashcards)} cards and ${number.format(PLAN_LIMITS.pro.agentCardsPerMonth)} AI assistant cards a month.`
            : `Up to ${number.format(PLAN_LIMITS.free.flashcards)} cards and ${number.format(PLAN_LIMITS.free.agentCardsPerMonth)} AI assistant cards a month.`
        }
        last={!subscription && pro && !pending}
      >
        {subscription ? (
          <p className="text-sm text-muted">
            {formatAmount(subscription.amount, subscription.currency)} /{" "}
            {subscription.interval === "year" ? "year" : "month"}
          </p>
        ) : null}
      </Row>

      {subscription ? (
        <Row
          label={subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}
          hint={
            subscription.status === "past_due"
              ? "Your last payment failed. Polar will retry; update your card to keep Pro."
              : subscription.cancelAtPeriodEnd
                ? "Pro stays active until then. Nothing is deleted afterwards; you just can't add past the free limits."
                : "Cancel or switch between monthly and yearly anytime."
          }
          last
        >
          <div className="flex flex-col items-end gap-2 max-sm:items-start">
            <p className="text-sm text-ink">{formatDate(subscription.currentPeriodEnd)}</p>
            <Button
              variant="outline"
              size="sm"
              busy={portal.isPending}
              disabled={!online}
              onClick={() => portal.mutate()}
            >
              Manage subscription
            </Button>
          </div>
        </Row>
      ) : pending ? (
        <Row
          label={unconfirmed ? "Payment not confirmed yet" : "Confirming your payment"}
          hint={
            unconfirmed
              ? "Polar hasn't confirmed a Pro subscription for this account yet. If you were charged, Pro appears here as soon as it does."
              : "Waiting for Polar to confirm your subscription. This usually takes a few seconds."
          }
          last
        >
          {unconfirmed && (
            <Button
              variant="outline"
              size="sm"
              busy={refresh.isPending || data.syncing}
              disabled={!online}
              onClick={() => refresh.mutate()}
            >
              Retry
            </Button>
          )}
        </Row>
      ) : !pro ? (
        <Row
          label="Upgrade to Pro"
          hint="Unlimited cards and decks (fair use), 10,000 AI assistant cards a month, and room for the largest Anki collections."
          last
        >
          <div className="flex flex-col items-end gap-2 max-sm:items-start">
            <Segmented options={INTERVAL_OPTIONS} value={interval} onChange={setInterval} />
            <Button
              busy={checkout.isPending}
              disabled={!online}
              onClick={() => checkout.mutate(interval)}
            >
              Upgrade
            </Button>
          </div>
        </Row>
      ) : null}
    </Section>
  );
}
