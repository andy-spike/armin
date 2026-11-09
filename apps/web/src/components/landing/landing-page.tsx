import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import { PLAN_LIMITS } from "@armin/core/plans";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { GitHubMark, SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { DOCS_URL, docsUrl } from "@/lib/docs-site";
import { SOURCE_CODE_URL } from "@/lib/source-code";
import { cn } from "@/lib/utils";
import { LandingClip } from "./landing-clip";
import type clips from "./clips.json";

const FREE_CARDS = new Intl.NumberFormat("en-US").format(PLAN_LIMITS.free.flashcards);

const TEXT_LINK =
  "underline decoration-ui-3 underline-offset-4 transition-colors hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function DocLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a href={docsUrl(path)} className={cn(TEXT_LINK, "text-ink")}>
      {children}
    </a>
  );
}

const STEPS: {
  clip: keyof typeof clips;
  title: string;
  body: ReactNode;
  guide: { path: string; label: string };
  label: string;
}[] = [
  {
    clip: "write",
    title: "Write a card for one idea.",
    body: (
      <>
        Each card has a front and a back in Markdown, with room for code, images, and equations.
        Write cards yourself, <DocLink path="guides/import-from-anki/">import an Anki deck</DocLink>
        , or <DocLink path="guides/ai-assistants/">have an AI assistant draft them</DocLink>.
      </>
    ),
    guide: { path: "guides/cards-and-decks/", label: "Cards and decks guide" },
    label:
      "The Add card dialog: a card asking what self-attention lets each token do is typed and saved to the Fundamentals of LLMs deck.",
  },
  {
    clip: "link",
    title: "Link what it builds on.",
    body: "Open the deck's graph and drag a link to the new card from each card it depends on. The new card stays locked, out of your reviews, until you've learned those first.",
    guide: { path: "guides/prerequisites/", label: "Prerequisites guide" },
    label:
      "The deck's graph: links are dragged from Tokens and from Embeddings to the new Self-attention card, which becomes locked.",
  },
  {
    clip: "review",
    title: "Review what's due.",
    body: "Try to recall the answer, reveal it, then grade how well you knew it. The FSRS scheduler uses each grade to pick the card's next due date, so you see it again just before you'd forget it.",
    guide: { path: "guides/reviewing/", label: "Reviewing guide" },
    label:
      "A review session: the Tokens card and then the Embeddings card are answered and graded Easy.",
  },
  {
    clip: "unlock",
    title: "Watch the next layer open.",
    body: "Once Tokens and Embeddings are learned, Self-attention and Context window unlock and join your reviews. An unlocked card stays unlocked even if you later forget a foundation; Armin just brings that foundation back for practice.",
    guide: { path: "guides/prerequisites/#locked-cards", label: "How unlocking works" },
    label:
      "The deck's graph after review: Tokens and Embeddings are in review, Self-attention and Context window are unlocked, and the cards above them are still locked.",
  },
];

function SectionRule({ headingId, children }: { headingId?: string; children: string }) {
  const label = "font-mono text-xs tracking-[0.14em] text-muted uppercase";
  return (
    <div className="mx-auto flex max-w-[76rem] items-center gap-5 px-5 sm:px-8">
      <span aria-hidden className="h-px flex-1 bg-ui-3" />
      {headingId ? (
        <h2 id={headingId} className={label}>
          {children}
        </h2>
      ) : (
        <span aria-hidden className={label}>
          {children}
        </span>
      )}
      <span aria-hidden className="h-px flex-1 bg-ui-3" />
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing notebook-bg min-h-dvh overflow-x-clip">
      <SiteHeader />

      <main>
        <section
          aria-labelledby="landing-title"
          className="mx-auto flex max-w-[76rem] flex-col items-center px-5 pt-16 pb-14 text-center sm:px-8 lg:pt-28 lg:pb-24"
        >
          <h1
            id="landing-title"
            className="landing-rise max-w-[16ch] text-[clamp(2.75rem,6.4vw,4.75rem)] leading-[1.02] tracking-[-0.03em] text-balance text-ink"
          >
            Study in the order knowledge is built.
          </h1>
          <p
            className="landing-rise mt-6 max-w-[34rem] text-xl leading-snug text-pretty text-muted"
            style={{ animationDelay: "80ms" }}
          >
            Armin is an open-source spaced-repetition flashcard app. Link each card to the cards it
            builds on, and it unlocks only once you've learned them, so the basics always come
            first.
          </p>
          <div
            className="landing-rise mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 lg:mt-9"
            style={{ animationDelay: "160ms" }}
          >
            <Link
              to="/sign-up"
              className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-base")}
            >
              Create a free account
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              to="/sign-in"
              className="text-sm font-medium text-ink underline decoration-ui-3 underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              I already have an account
            </Link>
          </div>
          <div
            className="landing-rise mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted"
            style={{ animationDelay: "240ms" }}
          >
            <Link to="/pricing" className={TEXT_LINK}>
              Free for up to {FREE_CARDS} cards
            </Link>
            <a href={DOCS_URL} className={cn(TEXT_LINK, "inline-flex items-center gap-1.5")}>
              <BookOpen className="size-3.5" aria-hidden />
              Read the docs
            </a>
            <a href={SOURCE_CODE_URL} className={cn(TEXT_LINK, "inline-flex items-center gap-1.5")}>
              <GitHubMark className="size-3.5" />
              Source on GitHub
            </a>
          </div>
        </section>

        <SectionRule headingId="landing-steps">How it works</SectionRule>

        <ol aria-labelledby="landing-steps" className="mx-auto max-w-[76rem] px-5 sm:px-8">
          {STEPS.map((step, i) => (
            <li
              key={step.clip}
              className="border-t border-border-strong py-14 first:border-t-0 first:pt-12 lg:py-20 lg:first:pt-16"
              aria-labelledby={`landing-step-${step.clip}`}
            >
              <div className="grid items-center gap-x-14 gap-y-8 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <h3
                    id={`landing-step-${step.clip}`}
                    className="text-[clamp(1.875rem,3.2vw,2.625rem)] leading-[1.1] tracking-[-0.02em] text-balance text-ink"
                  >
                    <span className="mb-3 block font-mono text-sm tracking-normal text-accent">
                      Step {i + 1}
                    </span>
                    {step.title}
                  </h3>
                  <p className="mt-5 max-w-[34rem] text-base leading-relaxed text-pretty text-muted lg:text-lg">
                    {step.body}
                  </p>
                  <a
                    href={docsUrl(step.guide.path)}
                    className={cn(
                      TEXT_LINK,
                      "mt-5 inline-flex items-center gap-1 text-sm font-medium text-ink",
                    )}
                  >
                    {step.guide.label}
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </a>
                </div>
                <div className="lg:col-span-7">
                  <LandingClip name={step.clip} label={step.label} />
                </div>
              </div>
            </li>
          ))}
        </ol>

        <SectionRule>Get started</SectionRule>

        <section aria-labelledby="landing-close" className="mx-auto max-w-[76rem] px-5 sm:px-8">
          <div className="flex flex-col items-center pt-16 pb-24 text-center lg:pt-20 lg:pb-32">
            <h2
              id="landing-close"
              className="max-w-[18ch] text-[clamp(2.25rem,4.8vw,3.75rem)] leading-[1.05] tracking-[-0.025em] text-balance text-ink"
            >
              Start with one foundation.
            </h2>
            <p className="mt-5 max-w-[40ch] text-lg leading-relaxed text-pretty text-muted">
              Make a deck, write the cards everything else depends on, and let the rest unlock as
              you learn.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/sign-up"
                className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-base")}
              >
                Create a free account
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                to="/sign-in"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 px-7 text-base",
                )}
              >
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted">
              New here? The{" "}
              <a href={docsUrl("getting-started/")} className={cn(TEXT_LINK, "text-ink")}>
                getting started guide
              </a>{" "}
              walks you through your first deck and review.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-strong">
        <div className="mx-auto flex max-w-[76rem] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-sm text-muted sm:px-8">
          <span className="mr-auto flex items-center gap-2 text-base text-ink">
            <ArminMark className="size-4.5" />
            <ArminWordmark />
          </span>
          <span>Open source under the AGPL-3.0 license</span>
          <a href={DOCS_URL} className={TEXT_LINK}>
            Documentation
          </a>
          <a href={SOURCE_CODE_URL} className={TEXT_LINK}>
            Source on GitHub
          </a>
          <a href={`${SOURCE_CODE_URL}/issues`} className={TEXT_LINK}>
            Report an issue
          </a>
          <Link to="/pricing" className={TEXT_LINK}>
            Pricing
          </Link>
          <Link to="/privacy" className={TEXT_LINK}>
            Privacy
          </Link>
          <Link to="/terms" className={TEXT_LINK}>
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
