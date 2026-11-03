import { SOURCE_CODE_URL } from "@/lib/source-code";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollStory } from "./scroll-story";

const GITHUB_URL = SOURCE_CODE_URL;

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * Public landing page, shown at `/` to signed-out visitors. One example deck
 * stays pinned while the story scrolls past it: write a card, link it, review,
 * watch the next layer unlock, then see a whole subject built the same way.
 */
export function LandingPage() {
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
        <ScrollStory />

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
