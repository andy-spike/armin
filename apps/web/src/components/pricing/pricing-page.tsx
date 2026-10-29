import { Link } from "@tanstack/react-router";
import { PLAN_LIMITS, PLAN_PRICES } from "@armin/core/plans";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

const number = new Intl.NumberFormat("en-US");

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Enough to build a real course and see whether Armin fits how you learn.",
    features: [
      `${number.format(PLAN_LIMITS.free.flashcards)} cards`,
      `${PLAN_LIMITS.free.decks} decks`,
      `${number.format(PLAN_LIMITS.free.agentCardsPerMonth)} AI assistant cards per month`,
      "Prerequisite graph and FSRS scheduling",
      "Web and mobile",
      "Anki import and full export",
    ],
    action: { label: "Start free", to: "/sign-up" as const },
  },
  {
    name: "Pro",
    price: `$${PLAN_PRICES.pro.monthlyUsd}`,
    period: `per month, or $${PLAN_PRICES.pro.yearlyUsd} per year`,
    blurb: "For learners who live in their library and build it with AI.",
    features: [
      "Unlimited cards and decks (fair use)",
      `${number.format(PLAN_LIMITS.pro.agentCardsPerMonth)} AI assistant cards per month`,
      "Everything in Free",
      "More room for images",
    ],
    action: null,
  },
];

const questions = [
  {
    q: "What happens if Pro ends?",
    a: "Nothing is deleted. You keep studying and exporting everything; you just can't add cards past the free limits.",
  },
  {
    q: "Why limit AI assistant cards?",
    a: "Assistants can create cards far faster than anyone can learn them. The monthly allowance keeps the service fast for everyone. Anki imports through an assistant don't count toward it.",
  },
  {
    q: "What does fair use mean?",
    a: "Pro has no card limit for ordinary study. Extremely large libraries may hit technical limits, which we raise as Armin grows.",
  },
];

export function PricingPage() {
  return (
    <div className="legal notebook-bg flex min-h-dvh flex-col">
      <header className="border-b border-border-strong bg-bg">
        <nav aria-label="Main" className="mx-auto flex h-14 max-w-4xl items-center px-5 sm:px-8">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArminMark className="size-5" />
            <ArminWordmark />
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pt-10 pb-16 sm:px-8 sm:pt-14">
        <h1 className="text-3xl text-ink">Pricing</h1>
        <p className="mt-2 text-muted">Start free. Upgrade when your library outgrows it.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => (
            <section
              key={plan.name}
              aria-labelledby={`plan-${plan.name}`}
              className="flex flex-col rounded-lg border border-border-strong bg-bg p-6"
            >
              <h2 id={`plan-${plan.name}`} className="text-xl text-ink">
                {plan.name}
              </h2>
              <p className="mt-3">
                <span className="text-4xl text-ink">{plan.price}</span>{" "}
                <span className="text-sm text-muted">{plan.period}</span>
              </p>
              <p className="mt-3 text-sm text-muted">{plan.blurb}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-ink">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden className="text-accent">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {plan.action ? (
                  <Link to={plan.action.to} className={buttonVariants({ className: "w-full" })}>
                    {plan.action.label}
                  </Link>
                ) : (
                  <p className="rounded-md border border-border-strong px-3 py-2 text-center text-sm text-muted">
                    Coming soon
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
        <h2 className="mt-14 text-xl text-ink">Questions</h2>
        <dl className="mt-4 space-y-5">
          {questions.map(({ q, a }) => (
            <div key={q}>
              <dt className="text-ink">{q}</dt>
              <dd className="mt-1 text-sm text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
