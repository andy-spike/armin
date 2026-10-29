import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@/components/pricing/pricing-page";

export const Route = createFileRoute("/pricing")({
  staticData: { documentScroll: true },
  // Public and crawlable, like the policy pages.
  ssr: true,
  headers: () => ({ "Cache-Control": "public, max-age=300, s-maxage=300" }),
  head: () => ({
    meta: [
      { title: "Pricing · Armin" },
      {
        name: "description",
        content: "Armin's free and Pro plans: card limits, AI assistant allowances, and prices.",
      },
    ],
  }),
  component: PricingPage,
});
