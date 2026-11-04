import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useToast } from "@/components/ui/toast";
import { armin, errorMessage } from "@/lib/armin-client";
import { conceptPoolQuery } from "@/lib/queries";

/**
 * A concept card's variant pool in the card editor: whether generation is
 * running, ready, or failed (with Retry), and the generated exercises with
 * their worked solutions, read-only.
 */
export function ConceptVariantsPanel({ flashcardId }: { flashcardId: string }) {
  const toast = useToast();
  const { data: pool, isPending } = useQuery(conceptPoolQuery(flashcardId));
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await armin.concepts.retryGeneration(flashcardId);
    } catch (error) {
      toast({ tone: "error", title: "Couldn't retry", description: errorMessage(error) });
    } finally {
      setRetrying(false);
    }
  };

  if (isPending || !pool) {
    return (
      <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
        {isPending ? "Loading variants…" : "Variants are unavailable."}
      </p>
    );
  }

  const count = pool.variants.length;
  return (
    <section aria-label="Variants" className="space-y-2">
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
      >
        {pool.status === "generating" && (
          <span className="flex items-center gap-2 text-ink">
            <LoaderCircle className="h-4 w-4 animate-spin text-accent-deep" aria-hidden />
            Generating variants…
          </span>
        )}
        {pool.status === "ready" && (
          <span className="flex items-center gap-2 text-ink">
            <CircleCheck className="h-4 w-4 text-good" aria-hidden />
            {count} variant{count === 1 ? "" : "s"} ready
          </span>
        )}
        {pool.status === "failed" && (
          <span className="flex min-w-0 flex-1 items-start gap-2 text-ink">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-again" aria-hidden />
            <span className="min-w-0">
              Generating variants failed.
              {pool.reason && <span className="block text-xs text-muted">{pool.reason}</span>}
            </span>
          </span>
        )}
        {pool.canRetry && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            busy={retrying}
            onClick={() => void retry()}
          >
            Retry
          </Button>
        )}
      </div>
      {count > 0 && (
        <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {pool.variants.map((variant, index) => (
            <li key={variant.id} className="rounded-md border border-border bg-surface px-3 py-2">
              <p className="mb-1 text-xs font-medium text-muted">Variant {index + 1}</p>
              <MarkdownContent content={variant.exercise} className="text-sm" />
              <p className="mb-1 mt-2 text-xs font-medium text-muted">Solution</p>
              <MarkdownContent content={variant.solution} className="text-sm text-muted" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
