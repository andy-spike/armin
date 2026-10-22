import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GraphMenuItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
};

type GraphContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  items: GraphMenuItem[];
  onClose: () => void;
};

export function GraphContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: GraphContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Move focus into the menu when it opens (mouse and keyboard alike), let
    // the arrow keys move between items, and give focus back on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusFrame = requestAnimationFrame(() => {
      ref.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus();
    });
    const menuItems = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        ref.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        const items = menuItems();
        if (items.length === 0) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(index + delta + items.length) % items.length]?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-40 border border-border bg-surface p-1 shadow-overlay"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
            item.variant === "destructive" && "text-again hover:text-again",
          )}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
