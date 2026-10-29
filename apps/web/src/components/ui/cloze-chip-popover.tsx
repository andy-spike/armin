import { Minus, Plus, Trash2 } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

export type ClozeChip = {
  cluster: number | null;
  hint: string | null;
  /** Position inside the editor frame, under the chip's first character. */
  top: number;
  left: number;
};

const stepClass =
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40";

/**
 * Settings for the cloze chip under the cursor: which card it hides on (chips
 * sharing a number blank together) and an optional hint shown in the blank.
 * Changes apply as they're made; Escape returns to the text.
 */
export function ClozeChipPopover({
  chip,
  onCluster,
  onHint,
  onRemove,
  onDone,
  leaving = false,
  onExited,
}: {
  chip: ClozeChip;
  /** Plays the exit animation, then calls `onExited`. */
  leaving?: boolean;
  onExited?: () => void;
  onCluster: (cluster: number) => void;
  onHint: (hint: string | null) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const cluster = chip.cluster ?? 1;
  return (
    // The group only catches keys and clicks that bubble from its own controls.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label="Cloze settings"
      style={{ top: chip.top, left: chip.left }}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
      onAnimationEnd={() => {
        if (leaving) onExited?.();
      }}
      className={`absolute z-20 flex ${leaving ? "pointer-events-none animate-pop-out" : "animate-pop"} items-center gap-2 border border-border bg-surface px-2 py-1.5 text-xs shadow-overlay`}
      onMouseDown={(event) => {
        // Keep the editor's selection on the chip unless a field is clicked.
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onDone();
        }
      }}
    >
      <span className="text-muted">Card</span>
      <div className="flex items-center">
        <button
          type="button"
          aria-label="Previous card number"
          disabled={cluster <= 1}
          className={stepClass}
          onClick={() => onCluster(cluster - 1)}
        >
          <Minus className="size-3.5" aria-hidden />
        </button>
        <span
          aria-live="polite"
          className="min-w-6 text-center font-mono font-medium text-ink tabular-nums"
        >
          {cluster}
        </span>
        <button
          type="button"
          aria-label="Next card number"
          disabled={cluster >= 99}
          className={stepClass}
          onClick={() => onCluster(cluster + 1)}
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
      <span aria-hidden className="h-4 w-px bg-border" />
      <input
        aria-label="Hint shown in the blank"
        placeholder="Hint (optional)"
        defaultValue={chip.hint ?? ""}
        maxLength={80}
        onChange={(event) => onHint(event.target.value.replace(/[{}]|::/g, "") || null)}
        className="h-6 w-36 border border-border bg-bg px-2 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
      />
      <Tooltip content="Remove cloze" className="px-2 py-1">
        <button type="button" aria-label="Remove cloze" className={stepClass} onClick={onRemove}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}
