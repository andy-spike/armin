import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@tanstack/react-router";
import { Brain } from "lucide-react";

const linkClass =
  "text-accent underline underline-offset-2 hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-tight tracking-[-0.02em] text-balance text-ink">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-12 text-2xl leading-snug tracking-[-0.015em] text-ink">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-8 text-lg leading-snug text-ink">{children}</h3>,
  p: ({ children }) => <p className="mt-4 text-base leading-7 text-ink">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 marker:text-faint">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-7 marker:text-muted">
      {children}
    </ol>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  a: ({ href = "", children }) =>
    // App routes navigate in place; everything else (mail, the site root) is a plain link.
    href.startsWith("/") && !href.startsWith("//") && href !== "/" ? (
      <Link to={href} className={linkClass}>
        {children}
      </Link>
    ) : (
      <a href={href} className={linkClass}>
        {children}
      </a>
    ),
  // Wide tables scroll sideways inside their own box instead of the page.
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto border border-border">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm leading-6">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-sunken">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border-strong px-3 py-2 align-top font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-border px-3 py-2 align-top first:font-medium">{children}</td>
  ),
};

/**
 * Public page for a legal document written in Markdown. The `legal` class
 * lets the document scroll instead of the locked app frame (see `app.css`).
 */
export function LegalPage({ source }: { source: string }) {
  return (
    <div className="legal notebook-bg flex min-h-dvh flex-col">
      <header className="border-b border-border-strong bg-bg">
        <nav aria-label="Main" className="mx-auto flex h-14 max-w-3xl items-center px-5 sm:px-8">
          <Link
            to="/"
            className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Brain className="size-5 text-accent" strokeWidth={1.75} aria-hidden />
            Armin
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-10 pb-16 sm:px-8 sm:pt-14">
        <article className="break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {source}
          </ReactMarkdown>
        </article>
      </main>
      <footer className="border-t border-border-strong bg-bg">
        <nav
          aria-label="Legal"
          className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-sm text-muted sm:px-8"
        >
          <Link to="/privacy" className="hover:text-ink" activeProps={{ "aria-current": "page" }}>
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink" activeProps={{ "aria-current": "page" }}>
            Terms of Service
          </Link>
        </nav>
      </footer>
    </div>
  );
}
