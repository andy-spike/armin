import type * as React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function useIsTruncated<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [truncated, setTruncated] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1);
  }, []);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  return { ref, truncated, measure };
}

export function TruncatedLabel({
  label,
  tooltip = label,
  side = "top",
  className,
}: {
  label: string;
  tooltip?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const { ref, truncated } = useIsTruncated<HTMLSpanElement>();

  const span = (
    <span ref={ref} className={cn("block min-w-0 flex-1 truncate text-left", className)}>
      {label}
    </span>
  );

  if (!truncated) return span;
  return (
    <Tooltip content={tooltip} side={side}>
      {span}
    </Tooltip>
  );
}

export function ClampedLabel({
  label,
  lines,
  side = "top",
  className,
}: {
  label: string;
  lines: 2 | 3;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const { ref, truncated } = useIsTruncated<HTMLSpanElement>();

  const span = (
    <span
      ref={ref}
      className={cn(
        "block min-w-0 break-words",
        lines === 2 ? "line-clamp-2" : "line-clamp-3",
        className,
      )}
    >
      {label}
    </span>
  );

  if (!truncated) return span;
  return (
    <Tooltip content={label} side={side}>
      {span}
    </Tooltip>
  );
}
