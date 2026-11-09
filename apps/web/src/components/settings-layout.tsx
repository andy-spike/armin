import { useId, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
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
    <section className="grid gap-x-10 gap-y-4 md:grid-cols-[240px_minmax(0,1fr)]">
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
  resetTo = "preset default",
  hintClassName,
  controlClassName,
}: {
  label: string;
  hint?: string;
  children: ReactNode | ((labelId: string) => ReactNode);
  last?: boolean;
  onReset?: () => void;
  resetTo?: string;
  hintClassName?: string;
  controlClassName?: string;
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
        {hint && <p className={cn("mt-0.5 text-[0.8125rem] text-muted", hintClassName)}>{hint}</p>}
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center justify-end gap-1.5 pt-0.5 max-sm:justify-start max-sm:pt-0",
          controlClassName,
        )}
      >
        {onReset && (
          <Tooltip content={`Reset to ${resetTo}`} className="px-2.5 py-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Reset ${label} to ${resetTo}`}
              onClick={onReset}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
        {typeof children === "function" ? children(labelId) : children}
      </div>
    </div>
  );
}
