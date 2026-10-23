import { useId, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 md:grid-cols-[240px_1fr]">
      <div className="pt-0.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-1 text-[0.8125rem] leading-snug text-muted">{description}</p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="self-start border border-border bg-surface">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  last,
  onReset,
}: {
  label: string;
  hint?: string;
  /**
   * A node, or a function that receives the visible label's id for the
   * control's `aria-labelledby`. Pass the function whenever the row contains a
   * form control so screen readers announce the label.
   */
  children: ReactNode | ((labelId: string) => ReactNode);
  last?: boolean;
  onReset?: () => void;
}) {
  const labelId = useId();
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 px-4 py-3.5 max-sm:grid-cols-1",
        !last && "border-b border-border",
      )}
    >
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-ink">
          {label}
        </p>
        {hint && <p className="mt-0.5 text-[0.8125rem] text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5 pt-0.5 max-sm:justify-start max-sm:pt-0">
        {onReset && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Reset ${label} to preset default`}
            title="Reset to preset default"
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {typeof children === "function" ? children(labelId) : children}
      </div>
    </div>
  );
}
