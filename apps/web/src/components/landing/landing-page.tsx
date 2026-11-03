import { SOURCE_CODE_URL } from "@/lib/source-code";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LandingClip } from "./landing-clip";

const GITHUB_URL = SOURCE_CODE_URL;

/**
 * The steps of using Armin, each with a clip of the real app working through
 * one example deck, "Fundamentals of LLMs". The clips are recorded by
 * apps/web/scripts/record-landing-clips.mjs.
 */
const STEPS = [
  {
    clip: "write",
    title: "Write a card for one idea.",
    body: "Front and back in Markdown, with code, images, and equations. Write cards yourself, import an Anki deck, or have an AI assistant draft them.",
    label:
      "The Add card dialog: a card asking what self-attention lets each token do is typed and saved to the Fundamentals of LLMs deck.",
  },
  {
    clip: "link",
    title: "Link what it builds on.",
    body: "In the deck's graph, drag a link to the new card from each card it depends on. It stays locked until those are learned, so it only comes up once you're ready for it.",
    label:
      "The deck's graph: links are dragged from Tokens and from Embeddings to the new Self-attention card, which becomes locked.",
  },
  {
    clip: "review",
    title: "Review what's due.",
    body: "Recall the answer, show it with Space, then grade how well you knew it. FSRS turns each grade into the next due date.",
    label:
      "A review session: the Tokens card and then the Embeddings card are answered and graded Easy.",
  },
  {
    clip: "unlock",
    title: "Watch the next layer open.",
    body: "Learning Tokens and Embeddings unlocked Self-attention and Context window, and they join your reviews. A card stays unlocked even if a foundation slips later; FSRS brings that foundation back for practice.",
    label:
      "The deck's graph after review: Tokens and Embeddings are in review, Self-attention and Context window are unlocked, and the cards above them are still locked.",
  },
] as const;

/** Public landing page, shown at `/` to signed-out visitors. */
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
            Spaced-repetition flashcards that unlock as their foundations are learned.
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
        </section>

        {/* A titled rule between the hero and the steps. */}
        <div className="mx-auto flex max-w-[76rem] items-center gap-5 px-5 sm:px-8">
          <span aria-hidden className="h-px flex-1 bg-ui-3" />
          <h2
            id="landing-steps"
            className="font-mono text-xs tracking-[0.14em] text-muted uppercase"
          >
            How it works
          </h2>
          <span aria-hidden className="h-px flex-1 bg-ui-3" />
        </div>

        <ol aria-labelledby="landing-steps" className="mx-auto max-w-[76rem] px-5 sm:px-8">
          {STEPS.map((step, i) => (
            <li
              key={step.clip}
              className="border-t border-border-strong py-14 first:border-t-0 first:pt-12 lg:py-20 lg:first:pt-16"
              aria-labelledby={`landing-step-${step.clip}`}
            >
              {/* Text beside its clip on wide screens, so both stay in view. */}
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
                </div>
                <div className="lg:col-span-7">
                  <LandingClip name={step.clip} label={step.label} />
                </div>
              </div>
            </li>
          ))}
        </ol>

        <section aria-labelledby="landing-close" className="mx-auto max-w-[76rem] px-5 sm:px-8">
          <div className="border-t border-border-strong pt-20 pb-24 lg:pt-28 lg:pb-32">
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
            <div className="mt-9 flex flex-wrap items-center gap-3">
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
          <a
            href={GITHUB_URL}
            className="underline decoration-ui-3 underline-offset-4 hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Source on GitHub
          </a>
          <a
            href={`${GITHUB_URL}/issues`}
            className="underline decoration-ui-3 underline-offset-4 hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Report an issue
          </a>
          <Link
            to="/docs/mcp"
            className="underline decoration-ui-3 underline-offset-4 hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            MCP documentation
          </Link>
          <Link
            to="/pricing"
            className="underline decoration-ui-3 underline-offset-4 hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Pricing
          </Link>
          <Link
            to="/privacy"
            className="underline decoration-ui-3 underline-offset-4 hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Privacy
          </Link>
          <Link
            to="/terms"
            className="underline decoration-ui-3 underline-offset-4 hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
