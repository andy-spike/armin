import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Brain, Check, Lock } from "lucide-react";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UnlockGraph } from "./unlock-graph";
import { ReviewDemo } from "./review-demo";

const GITHUB_URL = "https://github.com/andy-spike/armin";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * Public landing page, shown at `/` to signed-out visitors. The page reads as a
 * prerequisite graph: each section rests on the one before it along a spine,
 * and the sign-up sits at the top of the tree.
 */
export function LandingPage() {
  // Mark each spine node learned once its section has been read into view.
  useEffect(() => {
    const steps = document.querySelectorAll<HTMLElement>(".landing [data-step]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-reached", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -35% 0px" },
    );
    steps.forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing notebook-bg min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-20 border-b border-border-strong bg-bg">
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 max-w-[76rem] items-center gap-2 px-5 sm:px-8"
        >
          <Link
            to="/"
            className="mr-auto flex items-center gap-2 text-xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArminMark className="size-5" />
            <ArminWordmark />
          </Link>
          <a
            href={GITHUB_URL}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-sm:hidden")}
          >
            <GitHubMark className="size-4" />
            GitHub
          </a>
          <Link to="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link to="/sign-up" className={buttonVariants({ size: "sm" })}>
            Sign up
          </Link>
        </nav>
      </header>

      <main>
        <section
          aria-labelledby="landing-title"
          className="mx-auto grid max-w-[76rem] gap-10 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pt-20 lg:pb-28"
        >
          <div className="lg:col-span-5">
            <h1
              id="landing-title"
              className="text-[clamp(2.75rem,6.4vw,4.75rem)] leading-[1.02] tracking-[-0.03em] text-balance text-ink"
            >
              Study in the order knowledge is built.
            </h1>
            <p className="mt-6 max-w-[30rem] text-xl leading-snug text-pretty text-muted">
              Spaced-repetition flashcards that unlock as their foundations are learned.
            </p>
            <div className="mt-8 lg:mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
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
          </div>
          <UnlockGraph className="lg:col-span-7" />
        </section>

        <div className="border-y border-border-strong bg-bg">
          <ol className="landing-spine relative mx-auto max-w-[76rem] px-5 sm:px-8">
            <Step
              title="A card holds one idea."
              body={
                <>
                  <p>
                    Write the front and back in Markdown, with code blocks and images. Keep each
                    card small enough to answer in a breath; the structure comes from how cards
                    connect, not from cramming more onto one.
                  </p>
                  <p>
                    Basic, reversed, cloze, type-the-answer, and image-occlusion cards are built in.
                  </p>
                </>
              }
              figure={<CardSpecimen />}
            />
            <Step
              title="Then say what it builds on."
              body={
                <>
                  <p>
                    Give a card its prerequisites and it waits, locked, until each of them is
                    learned. New material always lands on foundations you already have.
                  </p>
                  <p>
                    The deck's graph view lays the whole structure out on a canvas, so you can see
                    and rewire what rests on what. Once a card opens it stays open. If you later
                    forget one of its foundations, FSRS brings that card back for practice.
                  </p>
                </>
              }
              figure={<PrerequisiteSpecimen />}
            />
            <Step
              title="Review in a few keystrokes."
              body={
                <>
                  <p>
                    Space shows the answer and 1 to 4 grades it. FSRS turns every grade into the
                    next due date, so cards you know come back rarely and shaky ones come back soon.
                  </p>
                  <p>
                    Every action in Armin has a shortcut, and you can rebind any of them. Click the
                    demo, or tab to it, and try the keys.
                  </p>
                </>
              }
              figure={<ReviewDemo />}
            />
            <Step
              title="Your library goes where you do."
              body={
                <p>
                  Cards live in your account rather than one device, and they stay yours to take
                  with you.
                </p>
              }
              figure={<FactsList />}
            />
          </ol>
        </div>

        <section aria-labelledby="landing-close" className="mx-auto max-w-[76rem] px-5 sm:px-8">
          <div
            data-step
            className="landing-step landing-summit relative pt-20 pb-24 pl-12 sm:pl-14 lg:pt-28 lg:pb-32"
          >
            <span className="landing-summit-node" aria-hidden>
              <Lock className="landing-node-locked size-4" strokeWidth={2} />
              <Brain className="landing-node-learned size-5" strokeWidth={1.75} />
            </span>
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

      <footer className="border-t border-border-strong bg-bg">
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

/** One node on the page's spine: a section that rests on the one before it. */
function Step({ title, body, figure }: { title: string; body: ReactNode; figure: ReactNode }) {
  return (
    <li
      data-step
      className="landing-step relative grid gap-10 py-20 pl-9 sm:pl-14 lg:grid-cols-12 lg:gap-10 lg:py-24"
    >
      <span className="landing-step-node" aria-hidden>
        <Lock className="landing-node-locked size-2.5" strokeWidth={2.25} />
        <Check className="landing-node-learned size-3" strokeWidth={2.75} />
      </span>
      <div className="lg:col-span-5">
        <h2 className="text-[clamp(1.875rem,3.2vw,2.625rem)] leading-[1.1] tracking-[-0.02em] text-balance text-ink">
          {title}
        </h2>
        <div className="mt-5 max-w-[34rem] space-y-4 text-base leading-relaxed text-pretty text-muted">
          {body}
        </div>
      </div>
      <div className="min-w-0 lg:col-span-7 lg:pt-1">{figure}</div>
    </li>
  );
}

/** A card as the review screen shows it, with the card types listed beside. */
function CardSpecimen() {
  return (
    <div className="grid grid-cols-1 gap-px border border-border-strong bg-border-strong sm:grid-cols-[minmax(0,1fr)_11rem]">
      <div className="min-w-0 bg-surface px-6 py-7 sm:px-8">
        <p className="text-lg leading-snug font-medium text-pretty text-ink">
          Why does a recursive function need a base case?
        </p>
        <div className="mt-5 border-t border-border pt-5 text-[0.9375rem] leading-relaxed text-ink/90">
          <p>Without one, every call makes another call until the stack overflows.</p>
          <pre className="mt-4 overflow-x-auto border border-border bg-surface-sunken px-4 py-3 font-mono text-[0.8125rem] leading-relaxed text-ink">
            <code>
              <span className="text-muted">{"def "}</span>
              {"fact(n):\n    "}
              <span className="text-muted">{"if "}</span>
              {"n == 0:\n        "}
              <span className="text-muted">{"return "}</span>
              {"1  "}
              <span className="text-accent">{"# base case"}</span>
              {"\n    "}
              <span className="text-muted">{"return "}</span>
              {"n * fact(n - 1)"}
            </code>
          </pre>
        </div>
      </div>
      <div className="flex flex-col bg-surface">
        <p className="border-b border-border-strong px-4 py-2.5 text-xs font-medium text-muted">
          Card types
        </p>
        <ul className="grid grid-cols-2 gap-px bg-border-strong sm:flex sm:flex-col sm:gap-0 sm:divide-y sm:divide-border-strong sm:bg-surface">
          {["Basic", "Reversed", "Cloze", "Type answer", "Image occlusion"].map((type, i) => (
            <li
              key={type}
              className={cn(
                "flex items-center justify-between gap-2 bg-surface px-4 py-3 text-sm text-ink",
                i === 0 && "bg-accent-tint text-accent-deep",
                i === 4 && "max-sm:col-span-2",
              )}
            >
              {type}
              {i === 0 && (
                <>
                  <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  <span className="sr-only">(this card)</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** How a locked card reads in Armin: what it needs and what is still missing. */
function PrerequisiteSpecimen() {
  const needs = [
    { label: "Recursion", learned: true },
    { label: "Lookup tables", learned: false },
  ];
  return (
    <div className="border border-border-strong bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 sm:px-8">
        <div>
          <p className="font-serif text-xl font-semibold tracking-tight text-ink">Memoization</p>
          <p className="mt-1 text-sm text-muted">
            When does caching a recursive call change its complexity?
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 border border-dashed border-ui-3 bg-surface-sunken px-2 py-1 font-mono text-[0.6875rem] text-muted uppercase">
          <Lock className="size-3" aria-hidden />
          locked
        </span>
      </div>
      <ul className="divide-y divide-border">
        {needs.map((need) => (
          <li key={need.label} className="flex items-center gap-3 px-6 py-3.5 sm:px-8">
            <span
              className={cn(
                "flex size-5 items-center justify-center border",
                need.learned
                  ? "border-accent bg-accent text-on-accent"
                  : "border-dashed border-ui-3 text-muted",
              )}
              aria-hidden
            >
              {need.learned && <Check className="size-3" strokeWidth={2.5} />}
            </span>
            <span className="flex-1 text-[0.9375rem] text-ink">{need.label}</span>
            <span
              className={cn("font-mono text-xs", need.learned ? "text-accent-deep" : "text-muted")}
            >
              {need.learned ? "learned" : "due tomorrow"}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border bg-surface-sunken px-6 py-3 text-sm text-muted sm:px-8">
        Opens after <span className="font-medium text-ink">1 more</span> prerequisite is learned.
      </p>
    </div>
  );
}

function FactsList() {
  const facts = [
    {
      term: "One account",
      detail:
        "Your decks, reviews, and images sync to your account, on the web and the mobile app.",
    },
    {
      term: "Export",
      detail: "Download your whole library as a ZIP whenever you like.",
    },
    {
      term: "Open source",
      detail: "AGPL-3.0 licensed. Read the code, report issues, and follow along on GitHub.",
      href: GITHUB_URL,
    },
  ];
  return (
    <dl className="divide-y divide-border-strong border-y border-border-strong">
      {facts.map((fact) => (
        <div key={fact.term} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
          <dt className="font-serif text-lg font-semibold text-ink">{fact.term}</dt>
          <dd className="text-[0.9375rem] leading-relaxed text-pretty text-muted">
            {fact.href ? (
              <a
                href={fact.href}
                className="underline decoration-ui-3 underline-offset-4 hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {fact.detail}
              </a>
            ) : (
              fact.detail
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
