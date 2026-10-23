import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalIsolation } from "@/keybindings/keybindings-provider";

const EXIT_MS = 200;

/**
 * The element focus returns to when the dialog closes. A dialog opened from a
 * dropdown item would lose its opener when the menu unmounts, so use the
 * menu's trigger instead.
 */
function captureReturnFocus() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const menu = active.closest<HTMLElement>('[role="menu"]');
  if (menu?.id) {
    return document.querySelector<HTMLElement>(
      `[aria-controls="${CSS.escape(menu.id)}"]`,
    );
  }
  return active;
}

/**
 * Accessible modal: portaled to <body> (escapes stacking contexts), focus is
 * trapped while open and restored on close, Escape and backdrop-click dismiss.
 * The panel never exceeds the viewport; with a `footer`, the header and footer
 * stay fixed while the body scrolls.
 */
export function Dialog({
  open,
  onClose,
  onExitComplete,
  title,
  description,
  children,
  footer,
  className,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Accessible name for dialogs that render their own heading instead of `title`. */
  ariaLabel?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  const onExitCompleteRef = React.useRef(onExitComplete);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const capturedOpenRef = React.useRef(false);
  const titleId = React.useId();
  const [present, setPresent] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const snapshotRef = React.useRef({ title, description, children, footer });
  const exiting = closing || (present && !open);

  // Capture the opener before the dialog content (and its autoFocus) mounts.
  // This must happen during render: React applies native `autoFocus` during
  // commit, before effects run.
  if (open && !capturedOpenRef.current && typeof document !== "undefined") {
    capturedOpenRef.current = true;
    returnFocusRef.current = captureReturnFocus();
  } else if (!open) {
    capturedOpenRef.current = false;
  }

  // While a dialog is mounted, isolate app-level keybindings beneath it so a
  // stray chord or rating key can't fire behind the modal. The dialog's own
  // Escape/Tab handlers (below) are intrinsic and unaffected.
  useModalIsolation(present);

  if (open && !exiting) {
    snapshotRef.current = { title, description, children, footer };
  }

  const content = exiting
    ? snapshotRef.current
    : { title, description, children, footer };

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    onExitCompleteRef.current = onExitComplete;
  }, [onExitComplete]);

  React.useEffect(() => {
    if (open) {
      setPresent(true);
      setClosing(false);
    } else if (present) {
      setClosing(true);
    }
  }, [open, present]);

  React.useEffect(() => {
    if (!present || exiting) return;

    const panel = panelRef.current;
    const focusFrame = requestAnimationFrame(() => {
      // React applies `autoFocus` itself (no DOM attribute), so keep any
      // focus it already placed inside the panel.
      if (panel?.contains(document.activeElement)) return;
      const autofocusHost =
        panel?.querySelector<HTMLElement>("[data-autofocus]");
      const target =
        autofocusHost?.querySelector<HTMLElement>('[contenteditable="true"]') ??
        panel?.querySelector<HTMLElement>('[contenteditable="true"]') ??
        panel?.querySelector<HTMLElement>(
          "[autofocus], input, textarea, select",
        ) ??
        panel;
      target?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panel) {
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [present, exiting]);

  React.useEffect(() => {
    if (!closing) return;

    let finished = false;
    const finishClose = () => {
      if (finished) return;
      finished = true;
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus();
      returnFocusRef.current = null;
      setPresent(false);
      setClosing(false);
      onExitCompleteRef.current?.();
    };

    const panel = panelRef.current;
    const onEnd = (event: AnimationEvent) => {
      if (event.target !== panel) return;
      finishClose();
    };

    panel?.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(finishClose, EXIT_MS + 50);

    return () => {
      panel?.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [closing]);

  if (!present) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 cursor-pointer bg-bg/90",
          exiting ? "pointer-events-none animate-fade-out" : "animate-fade-in",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={content.title ? titleId : undefined}
        aria-label={content.title ? undefined : ariaLabel}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-md max-h-[calc(100dvh-2rem)] rounded-lg border border-border bg-surface shadow-overlay outline-none",
          content.footer
            ? "flex flex-col overflow-hidden"
            : "overflow-y-auto overscroll-contain p-6",
          exiting ? "animate-pop-out" : "animate-pop",
          className,
        )}
      >
        {content.title && (
          <div
            className={cn(
              "flex items-start justify-between gap-4",
              content.footer
                ? "shrink-0 px-6 pt-6 pb-4"
                : "sticky -top-6 z-10 -mx-6 -mt-6 mb-4 rounded-t-lg bg-surface px-6 pt-6 pb-4",
            )}
          >
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-ink">
                {content.title}
              </h2>
              {content.description && (
                <p className="mt-1 text-sm text-muted">{content.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {content.footer ? (
          <>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6",
                !content.title && "pt-6",
              )}
            >
              {content.children}
            </div>
            <div className="shrink-0 border-t border-border px-6 py-4">
              {content.footer}
            </div>
          </>
        ) : (
          content.children
        )}
      </div>
    </div>,
    document.body,
  );
}
