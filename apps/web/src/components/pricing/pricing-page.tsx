import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { MAX_FLASHCARDS_PER_DECK, PLAN_LIMITS, PLAN_PRICES } from "@armin/core/plans";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatStorage, picturesIn } from "@/lib/storage-size";
import { cn } from "@/lib/utils";

type Interval = "month" | "year";

const number = new Intl.NumberFormat("en-US");
const n = (value: number) => number.format(value);

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;
const { monthlyUsd, yearlyUsd } = PLAN_PRICES.pro;
const yearlySavingUsd = monthlyUsd * 12 - yearlyUsd;
const yearlySavingPercent = Math.round((yearlySavingUsd / (monthlyUsd * 12)) * 100);

/** The shared image and audio pool, with roughly how many pictures it holds. */
function storage(bytes: number) {
  return `${formatStorage(bytes)}, about ${n(picturesIn(bytes))} pictures`;
}

/** The headline allowances each plan card lists, most important first. */
const highlights = {
  free: [
    <>
      <strong>{n(free.flashcards)}</strong> cards in up to <strong>{free.decks}</strong> decks
    </>,
    <>
      <strong>{n(free.agentCardsPerMonth)}</strong> AI assistant cards a month
    </>,
    <>
      <strong>{formatStorage(free.mediaBytes)}</strong> for images and audio
    </>,
    <>Prerequisite graph and FSRS scheduling</>,
    <>Anki import and full export</>,
  ],
  pro: [
    <>
      <strong>Unlimited</strong> cards and decks (fair use, up to {n(pro.flashcards)} cards)
    </>,
    <>
      <strong>{n(pro.agentCardsPerMonth)}</strong> AI assistant cards a month
    </>,
    <>
      <strong>{formatStorage(pro.mediaBytes)}</strong> for images and audio
    </>,
    <>Room for the largest Anki collections</>,
    <>Everything in Free</>,
  ],
} satisfies Record<"free" | "pro", ReactNode[]>;

/** A cell value: text, or `true` for "included". */
type Cell = string | true;

const comparison: {
  group: string;
  rows: { feature: string; hint?: string; free: Cell; pro: Cell }[];
}[] = [
  {
    group: "Your library",
    rows: [
      {
        feature: "Cards",
        free: n(free.flashcards),
        pro: `Unlimited, up to ${n(pro.flashcards)}`,
      },
      {
        feature: "Review items",
        hint: "Each side of a reversed card and each cloze blank counts once.",
        free: n(free.reviewUnits),
        pro: n(pro.reviewUnits),
      },
      { feature: "Decks", free: n(free.decks), pro: `Unlimited, up to ${n(pro.decks)}` },
      {
        feature: "Cards per deck",
        free: n(MAX_FLASHCARDS_PER_DECK),
        pro: n(MAX_FLASHCARDS_PER_DECK),
      },
      {
        feature: "Images and audio",
        hint: "One storage pool, shared by both.",
        free: storage(free.mediaBytes),
        pro: storage(pro.mediaBytes),
      },
    ],
  },
  {
    group: "AI assistants",
    rows: [
      {
        feature: "Connect ChatGPT, Claude, Gemini, Claude Code, Codex, and other MCP clients",
        free: true,
        pro: true,
      },
      {
        feature: "Cards created by assistants",
        free: `${n(free.agentCardsPerMonth)} a month`,
        pro: `${n(pro.agentCardsPerMonth)} a month`,
      },
      {
        feature: "Assistant changes",
        hint: "Creating, editing, moving, and linking cards and decks.",
        free: `${n(free.agentWritesPerHour)} an hour`,
        pro: `${n(pro.agentWritesPerHour)} an hour`,
      },
      {
        feature: "Anki import through an assistant",
        hint: "Doesn't count toward the monthly card allowance.",
        free: true,
        pro: true,
      },
    ],
  },
  {
    group: "Studying",
    rows: [
      { feature: "Prerequisite graph with locked cards", free: true, pro: true },
      { feature: "FSRS scheduling", free: true, pro: true },
      { feature: "Cram practice and stats", free: true, pro: true },
      { feature: "Equations, images, and audio on cards", free: true, pro: true },
      { feature: "Web and mobile", free: true, pro: true },
    ],
  },
  {
    group: "Your data",
    rows: [
      { feature: "Anki import (.apkg, .colpkg, text)", free: true, pro: true },
      { feature: "Full library export as a ZIP", free: true, pro: true },
    ],
  },
];

const questions = [
  {
    q: "What happens if Pro ends?",
    a: "Nothing is deleted. You keep studying and exporting everything; you just can't add cards past the free limits.",
  },
  {
    q: "Can I get a refund?",
    a: "Yes. Email support@armincards.app within 14 days of any payment for a full refund. You can cancel anytime from Settings → Billing; Pro then lasts until the end of the period you paid for.",
  },
  {
    q: "Who handles the payment?",
    a: "Polar, our merchant of record. Polar charges your card, handles sales tax and VAT, and sends your receipts. Armin never sees your card details.",
  },
  {
    q: "Why limit AI assistant cards?",
    a: "Assistants can create cards far faster than anyone can learn them. The monthly allowance keeps the service fast for everyone. Anki imports through an assistant don't count toward it.",
  },
  {
    q: "What does fair use mean?",
    a: `Pro fits libraries of up to ${n(pro.flashcards)} cards, more than the biggest medical school decks. Any single deck holds up to ${n(MAX_FLASHCARDS_PER_DECK)} cards on every plan, so very large Anki decks import as several decks.`,
  },
];

/** Monthly or yearly billing; the labels on either side also pick a period. */
function IntervalToggle({
  value,
  onChange,
}: {
  value: Interval;
  onChange: (value: Interval) => void;
}) {
  const yearly = value === "year";
  const label = (active: boolean) =>
    cn(
      "cursor-pointer text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      active ? "text-ink" : "text-muted hover:text-ink",
    );
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        tabIndex={-1}
        className={label(!yearly)}
        onClick={() => onChange("month")}
      >
        Monthly
      </button>
      <Switch
        checked={yearly}
        onCheckedChange={(checked) => onChange(checked ? "year" : "month")}
        aria-label="Bill yearly"
      />
      <button
        type="button"
        tabIndex={-1}
        className={label(yearly)}
        onClick={() => onChange("year")}
      >
        Yearly
      </button>
      <span className="bg-accent-tint px-1.5 py-0.5 text-xs font-medium text-accent-deep">
        Save {yearlySavingPercent}%
      </span>
    </div>
  );
}

function Highlights({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5 text-sm text-ink [&_strong]:font-semibold [&_strong]:tabular-nums">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.25} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <Check aria-hidden className="mt-0.5 size-4 text-accent" strokeWidth={2.25} />
        <span className="sr-only">Included</span>
      </>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

export function PricingPage() {
  const [interval, setInterval] = useState<Interval>("month");
  const yearly = interval === "year";

  return (
    <div className="legal notebook-bg flex min-h-dvh flex-col">
      <header className="border-b border-border-strong bg-bg">
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-5 sm:px-8"
        >
          <Link
            to="/"
            className="mr-auto flex items-center gap-2 text-xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArminMark className="size-5" />
            <ArminWordmark />
          </Link>
          <Link to="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-10 pb-20 sm:px-8 sm:pt-16">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl text-balance text-ink">Pricing</h1>
            <p className="mt-3 max-w-prose text-muted">
              Start free. Upgrade when your library outgrows it.
            </p>
          </div>
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <section
            aria-labelledby="plan-free"
            className="flex flex-col border border-border-strong bg-bg p-6 sm:p-8"
          >
            <h2 id="plan-free" className="text-2xl text-ink">
              Free
            </h2>
            <p className="mt-2 text-sm text-muted md:min-h-10">
              Enough to build a real course and see whether Armin fits how you learn.
            </p>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-5xl text-ink tabular-nums">$0</span>
              <span className="text-sm text-muted">forever</span>
            </div>
            <p className="mt-1 min-h-5 text-sm text-muted">No card required.</p>
            <Link
              to="/sign-up"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "mt-6 w-full",
              })}
            >
              Start free
            </Link>
            <div className="mt-8 border-t border-border pt-6">
              <Highlights items={highlights.free} />
            </div>
          </section>

          <section
            aria-labelledby="plan-pro"
            className="flex flex-col border border-accent bg-bg p-6 ring-1 ring-accent sm:p-8"
          >
            <h2 id="plan-pro" className="text-2xl text-ink">
              Pro
            </h2>
            <p className="mt-2 text-sm text-muted md:min-h-10">
              For learners who live in their library and build it with AI.
            </p>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-5xl text-ink tabular-nums">
                ${yearly ? yearlyUsd : monthlyUsd}
              </span>
              <span className="text-sm text-muted">{yearly ? "per year" : "per month"}</span>
            </div>
            <p className="mt-1 min-h-5 text-sm text-muted" aria-live="polite">
              {yearly
                ? "Billed once a year. Cancel anytime."
                : "Billed every month. Cancel anytime."}
            </p>
            {/* Settings → Billing opens checkout; signed-out visitors sign in
                first and return there with the chosen period. */}
            <Link
              to="/settings"
              search={{ tab: "billing", interval }}
              className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}
            >
              Upgrade to Pro
            </Link>
            <div className="mt-8 border-t border-border pt-6">
              <Highlights items={highlights.pro} />
            </div>
          </section>
        </div>

        <section aria-labelledby="compare" className="mt-20">
          <h2 id="compare" className="text-2xl text-ink">
            Compare plans
          </h2>
          <p className="mt-2 text-sm text-muted">
            Every feature is on both plans. Pro raises the limits.
          </p>
          <table className="mt-6 w-full border-collapse bg-bg text-sm">
            <thead>
              <tr className="border-b border-border-strong text-left">
                <th scope="col" className="w-[40%] py-3 pr-4 font-medium text-muted sm:w-1/2">
                  <span className="sr-only">Feature</span>
                </th>
                <th
                  scope="col"
                  className="w-[30%] px-3 py-3 font-serif text-base text-ink sm:w-1/4"
                >
                  Free
                </th>
                <th
                  scope="col"
                  className="w-[30%] px-3 py-3 font-serif text-base text-ink sm:w-1/4"
                >
                  Pro
                </th>
              </tr>
            </thead>
            {comparison.map(({ group, rows }) => (
              <tbody key={group}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={3}
                    className="pt-8 pb-2 text-left text-xs font-semibold tracking-wide text-muted uppercase"
                  >
                    {group}
                  </th>
                </tr>
                {rows.map((row) => (
                  <tr key={row.feature} className="border-t border-border align-top">
                    <th scope="row" className="py-3 pr-4 text-left font-normal text-ink">
                      {row.feature}
                      {row.hint && (
                        <span className="mt-0.5 block text-xs text-muted">{row.hint}</span>
                      )}
                    </th>
                    <td className="px-3 py-3 text-ink">
                      <CellValue value={row.free} />
                    </td>
                    <td className="px-3 py-3 text-ink">
                      <CellValue value={row.pro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </section>

        <section aria-labelledby="questions" className="mt-20">
          <h2 id="questions" className="text-2xl text-ink">
            Questions
          </h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {questions.map(({ q, a }) => (
              <div key={q}>
                <dt className="font-medium text-ink">{q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
