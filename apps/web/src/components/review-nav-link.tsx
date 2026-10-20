import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import { useNow } from "@/lib/session";
import { Link } from "@tanstack/react-router";
import { Check, GraduationCap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn, plural } from "@/lib/utils";

const reviewButton = cn(
  buttonVariants({ variant: "primary", size: "sm" }),
  "titlebar-no-drag mx-2 shrink-0 sm:mx-4 focus-visible:ring-inset focus-visible:ring-offset-0",
);
const reviewButtonActive = cn(
  buttonVariants({ variant: "primary", size: "sm" }),
  "titlebar-no-drag mx-2 shrink-0 sm:mx-4 bg-accent-deep hover:bg-accent-deep focus-visible:ring-inset focus-visible:ring-offset-0",
);

/** The Review link without its due count, for before the library is ready. */
export function ReviewNavLinkPlaceholder() {
  return (
    <Link
      to="/review"
      className={reviewButton}
      activeProps={{ className: reviewButtonActive }}
      aria-label="Review"
    >
      <GraduationCap className="h-4 w-4" strokeWidth={1.5} />
      <span className="hidden sm:inline">Review</span>
    </Link>
  );
}

export function ReviewNavLink() {
  // Reactive: updates when any device reviews or edits, and as time passes.
  const now = useNow();
  const queueQuery = useQuery(convexQuery(api.review.queue, { now }));

  const dueCount = queueQuery.data?.items.length ?? 0;
  const statusLabel =
    queueQuery.isSuccess && dueCount === 0
      ? "all caught up"
      : queueQuery.isSuccess
        ? `${plural(dueCount, "review unit")} due`
        : undefined;

  return (
    <Link
      to="/review"
      className={reviewButton}
      activeProps={{ className: reviewButtonActive }}
      aria-label={statusLabel ? `Review, ${statusLabel}` : "Review"}
    >
      <GraduationCap className="h-4 w-4" strokeWidth={1.5} />
      <span className="hidden sm:inline">Review</span>
      {queueQuery.isSuccess && (
        <span className="inline-flex items-center tabular-nums">
          (
          {dueCount > 0 ? (
            dueCount
          ) : (
            <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          )}
          )
        </span>
      )}
    </Link>
  );
}
