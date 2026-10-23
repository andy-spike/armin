import { useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// Low enough that Fit view can frame a large deck. The minimap keeps the graph
// navigable when the fitted cards are too small to read.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

/** Zoom out/in, an editable zoom percentage, reset to 100%, and fit view. */
export function ZoomControl() {
  const { zoom } = useViewport();
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const [draft, setDraft] = useState<string | null>(null);
  const percent = Math.round(zoom * 100);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parsed / 100));
    void zoomTo(clamped, { duration: 150 });
  };

  const buttonClass =
    "flex h-7 w-7 items-center justify-center text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

  return (
    <div className="flex items-center border border-border bg-surface shadow-overlay">
      <button
        type="button"
        onClick={() => void zoomOut({ duration: 150 })}
        aria-label="Zoom out"
        className={buttonClass}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center border-x border-border px-1">
        <input
          aria-label="Zoom level"
          inputMode="numeric"
          className="w-9 bg-transparent text-right text-xs tabular-nums text-ink outline-none"
          value={draft ?? String(percent)}
          onChange={(event) =>
            setDraft(event.target.value.replace(/[^0-9]/g, ""))
          }
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
        <span className="pl-0.5 text-xs text-muted">%</span>
      </div>
      <button
        type="button"
        onClick={() => void zoomIn({ duration: 150 })}
        aria-label="Zoom in"
        className={buttonClass}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void zoomTo(1, { duration: 150 })}
        aria-label="Reset zoom to 100%"
        title="Reset zoom"
        className={cn(buttonClass, "border-l border-border")}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void fitView({ padding: 0.2, duration: 300 })}
        aria-label="Fit view"
        className={cn(buttonClass, "border-l border-border")}
      >
        <Maximize className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
