import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import {
  CircleCheck,
  CircleSlash,
  FlagOff,
  LoaderCircle,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { api } from "@armin/backend/api";
import { conceptVariantSchema } from "@armin/core/flashcard-types";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { formatAllowanceReset } from "@/components/variant-usage";
import { armin, errorMessage } from "@/lib/armin-client";
import { conceptPoolQuery } from "@/lib/queries";

type PoolVariant = NonNullable<FunctionReturnType<typeof api.concepts.pool>>["variants"][number];

/**
 * A concept card's variant pool in the card editor: whether generation is
 * running, ready, failed (with Retry), or stopped by the monthly variant
 * allowance (until it has room again), and the generated exercises with their
 * worked solutions. With Pro the learner curates them: edit a variant's
 * exercise or solution, delete one, or unflag one flagged during review.
 * Flagged variants are listed apart, since reviews no longer show them.
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
  const active = pool.variants.filter((variant) => variant.status === "active");
  const flagged = pool.variants.filter((variant) => variant.status === "flagged");
  // Outside Pro the pool is read-only, like the template.
  const editable = !pool.requiresPro;
  // Reviews need an active variant, so the last one can't be flagged or deleted.
  const lastActive = active.length === 1;
  // Numbered by place in the pool, so a variant keeps its number when flagged.
  const number = new Map(pool.variants.map((variant, index) => [variant.id, index + 1]));
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
            {active.length} variant{active.length === 1 ? "" : "s"} ready
            {flagged.length > 0 && <span className="text-muted">· {flagged.length} flagged</span>}
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
        {pool.status === "allowanceUsed" && (
          <span className="flex min-w-0 flex-1 items-start gap-2 text-ink">
            <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
            {pool.canRetry || !pool.allowance ? (
              <span className="min-w-0">
                Variant allowance has room again
                <span className="block text-xs text-muted">
                  Retry to generate this card's variants.
                </span>
              </span>
            ) : (
              <span className="min-w-0">
                Variant allowance used
                <span className="block text-xs text-muted">
                  {pool.allowance.limit === 0
                    ? "Your plan doesn't include generated variants."
                    : `New variants resume on ${formatAllowanceReset(pool.allowance.resetsAt)}.`}
                  {count > 0
                    ? ` Reviews reuse this card's ${count} variant${count === 1 ? "" : "s"}${pool.allowance.limit === 0 ? "" : " until then"}.`
                    : " The card has no exercise to review until it gets one."}
                </span>
              </span>
            )}
          </span>
        )}
        {pool.requiresPro && (
          <span className="basis-full text-xs text-muted">
            No new variants are generated without Pro.
          </span>
        )}
        {pool.canRetry && (
          <Button
            type="button"
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
        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {active.length > 0 && (
            <ol aria-label="Active variants" className="space-y-2">
              {active.map((variant) => (
                <VariantItem
                  key={variant.id}
                  variant={variant}
                  label={`Variant ${number.get(variant.id)}`}
                  assigned={variant.id === pool.assignedVariantId}
                  editable={editable}
                  canRemove={!lastActive}
                />
              ))}
            </ol>
          )}
          {flagged.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">
                Flagged ({flagged.length}) · not shown in review
              </p>
              <ol aria-label="Flagged variants" className="space-y-2">
                {flagged.map((variant) => (
                  <VariantItem
                    key={variant.id}
                    variant={variant}
                    label={`Variant ${number.get(variant.id)}`}
                    assigned={false}
                    editable={editable}
                    canRemove
                  />
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** One variant: its exercise and solution, or its editor, with its actions. */
function VariantItem({
  variant,
  label,
  assigned,
  editable,
  canRemove,
}: {
  variant: PoolVariant;
  label: string;
  /** The card's next review shows this variant. */
  assigned: boolean;
  editable: boolean;
  /** False for the card's only active variant. */
  canRemove: boolean;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [draft, setDraft] = useState({ exercise: "", solution: "", version: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flagged = variant.status === "flagged";

  const startEdit = () => {
    setDraft({ exercise: variant.exercise, solution: variant.solution, version: variant.version });
    setError(null);
    setMode("edit");
  };

  const save = async () => {
    const parsed = conceptVariantSchema.safeParse({
      exercise: draft.exercise,
      solution: draft.solution,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the exercise and solution.");
      return;
    }
    setBusy(true);
    try {
      const result = await armin.concepts.editVariant({
        id: variant.id,
        version: draft.version,
        ...parsed.data,
      });
      if (result.status === "conflict") {
        setError(`${result.message} Cancel to see the latest version.`);
        return;
      }
      setMode("view");
      toast({ tone: "success", title: "Variant updated" });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    setBusy(true);
    try {
      await action();
      toast({ tone: "success", title: success });
    } catch (caught) {
      toast({ tone: "error", title: failure, description: errorMessage(caught) });
    } finally {
      setBusy(false);
      setMode("view");
    }
  };

  return (
    <li className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="mb-1 flex min-h-8 items-center gap-2">
        <p className="min-w-0 flex-1 text-xs font-medium text-muted">
          {label}
          {variant.origin === "edited" && <span> · Edited</span>}
          {assigned && <span className="text-accent-deep"> · Next in review</span>}
        </p>
        {editable && mode === "view" && (
          <div className="-mr-1 flex shrink-0 items-center">
            {flagged && (
              <Tooltip content="Unflag variant">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Unflag variant"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => armin.concepts.unflagVariant(variant.id),
                      "Variant unflagged",
                      "Couldn't unflag variant",
                    )
                  }
                >
                  <FlagOff className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
            <Tooltip content="Edit variant">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Edit variant"
                disabled={busy}
                onClick={startEdit}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip
              content={
                canRemove ? "Delete variant" : "Reviews need this card's only active variant"
              }
            >
              {/* A disabled button gets no pointer events, so the wrapper carries the tooltip. */}
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete variant"
                  disabled={busy || !canRemove}
                  onClick={() => setMode("confirmDelete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>
          </div>
        )}
      </div>

      {mode === "edit" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Exercise</p>
          <MarkdownEditor
            textOnly
            aria-label="Variant exercise"
            value={draft.exercise}
            onChange={(exercise) => setDraft((current) => ({ ...current, exercise }))}
          />
          <p className="text-xs font-medium text-muted">Solution</p>
          <MarkdownEditor
            textOnly
            aria-label="Variant solution"
            value={draft.solution}
            onChange={(solution) => setDraft((current) => ({ ...current, solution }))}
          />
          {error && (
            <p role="alert" className="text-xs text-again">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setMode("view")}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" busy={busy} onClick={() => void save()}>
              Save variant
            </Button>
          </div>
        </div>
      ) : (
        <>
          <MarkdownContent content={variant.exercise} className="text-sm" />
          <p className="mb-1 mt-2 text-xs font-medium text-muted">Solution</p>
          <MarkdownContent content={variant.solution} className="text-sm text-muted" />
        </>
      )}

      {mode === "confirmDelete" && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-again/40 bg-again/5 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">Delete this variant? Reviews won't show it again.</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setMode("view")}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            busy={busy}
            onClick={() =>
              void run(
                () => armin.concepts.deleteVariant(variant.id),
                "Variant deleted",
                "Couldn't delete variant",
              )
            }
          >
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}
