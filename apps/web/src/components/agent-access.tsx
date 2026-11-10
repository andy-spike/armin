import { Library, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentAccess({
  scopes,
  className,
}: {
  scopes: { name: string; description: string }[];
  className?: string;
}) {
  return (
    <section
      aria-labelledby="agent-access-title"
      className={cn("border border-border bg-surface", className)}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <Library className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="agent-access-title" className="text-sm font-medium text-ink">
            What this assistant can do
          </h2>
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
            These permissions cover your whole library, including decks and cards you add later.
          </p>
          <ul className="mt-3 space-y-2">
            {scopes.map((scope) => (
              <li key={scope.name} className="flex gap-2 text-[0.8125rem] leading-snug text-ink">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-accent"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span>{scope.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <AgentLimits className="border-t border-border px-4 py-3.5" />
    </section>
  );
}

export function AgentLimits({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-[0.8125rem] leading-snug text-muted", className)}>
      <ShieldCheck className="mt-px size-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      <span>
        It can’t permanently delete cards or decks, reschedule cards on its own, upload images
        outside an approved Anki import, export your library, or manage your account. Ratings are
        recorded only when you give them, and archiving is reversible.
      </span>
    </p>
  );
}
