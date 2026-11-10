import { Link } from "@tanstack/react-router";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { DOCS_URL } from "@/lib/docs-site";
import { SOURCE_CODE_URL } from "@/lib/source-code";
import { cn } from "@/lib/utils";

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const NAV_LINK =
  "inline-flex h-8 items-center gap-1.5 px-2.5 text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-[current=page]:text-ink";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/60 backdrop-blur-lg backdrop-saturate-150">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-[76rem] items-center gap-1 px-5 sm:px-8"
      >
        <Link
          to="/"
          className="mr-3 flex items-center gap-2 text-xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:mr-5"
        >
          <ArminMark className="size-5" />
          <ArminWordmark />
        </Link>
        <div className="flex items-center max-sm:hidden">
          <Link to="/pricing" className={NAV_LINK} activeProps={{ "aria-current": "page" }}>
            Pricing
          </Link>
          <a href={DOCS_URL} className={NAV_LINK}>
            Docs
          </a>
          <a href={SOURCE_CODE_URL} className={NAV_LINK}>
            <GitHubMark className="size-3.5" />
            GitHub
          </a>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link to="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
          <Link to="/sign-up" className={cn(buttonVariants({ size: "sm" }), "ml-1")}>
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}
