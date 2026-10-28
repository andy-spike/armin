import { Library, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one access level every approved connection receives. There are no
 * per-deck, read-only, or edit/create choices to present.
 */
export function AgentAccess({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="agent-access-title"
      className={cn("border border-border bg-surface", className)}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <Library className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0">
          <h2 id="agent-access-title" className="text-sm font-medium text-ink">
            Your whole library
          </h2>
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            One approval gives this assistant all nine Armin tools, so it can create and read cards,
            edit or archive cards, create and rename decks, move cards, and change prerequisite
            links in every deck. This includes decks you add later.
          </p>
        </div>
      </div>
      <AgentLimits className="border-t border-border px-4 py-3.5" />
    </section>
  );
}

/** Limits no connection setting can lift, shown beside consent and connections. */
export function AgentLimits({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-[0.8125rem] leading-snug text-muted", className)}>
      <ShieldCheck className="mt-px size-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      <span>
        It can’t permanently delete cards or decks, upload images, rate reviews, change scheduling,
        export your library, or manage your account. Archiving is reversible.
      </span>
    </p>
  );
}
