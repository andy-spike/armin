import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalIsolation } from "@/keybindings/keybindings-provider";

const EXIT_MS = 200;
const VIEW_SWAP_MS = 250;

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
    return document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`);
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
  view,
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
  /**
   * Names the content currently shown, for a dialog that switches between
   * views (an editor and its "Discard changes?" step). Changing it glides the
   * panel to its new height and fades the new view in instead of snapping.
   */
  view?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  const onExitCompleteRef = React.useRef(onExitComplete);
  const titleId = React.useId();
  const [present, setPresent] = React.useState(open);
  const [wasOpen, setWasOpen] = React.useState(false);
  const [returnFocus, setReturnFocus] = React.useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = React.useState({ title, description, children, footer });
  const exiting = present && !open;

  // Capture the opener before the dialog content (and its autoFocus) mounts.
  // This must happen during render: React applies native `autoFocus` during
  // commit, before effects run.
  if (open !== wasOpen && typeof document !== "undefined") {
    setWasOpen(open);
    if (open) {
      setPresent(true);
      setReturnFocus(captureReturnFocus());
    }
  }

  // While a dialog is mounted, isolate app-level keybindings beneath it so a
  // stray chord or rating key can't fire behind the modal. The dialog's own
  // Escape/Tab handlers (below) are intrinsic and unaffected.
  useModalIsolation(present);

  // Keep the last open render's content to show through the exit animation
  // (ADR 0016).
  if (
    open &&
    (snapshot.title !== title ||
      snapshot.description !== description ||
      snapshot.children !== children ||
      snapshot.footer !== footer)
  ) {
    setSnapshot({ title, description, children, footer });
  }

  const content = exiting ? snapshot : { title, description, children, footer };

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    onExitCompleteRef.current = onExitComplete;
  }, [onExitComplete]);

  React.useEffect(() => {
    if (!present || exiting) return;

    const panel = panelRef.current;
    const focusFrame = requestAnimationFrame(() => {
      // React applies `autoFocus` itself (no DOM attribute), so keep any
      // focus it already placed inside the panel.
      if (panel?.contains(document.activeElement)) return;
      const autofocusHost = panel?.querySelector<HTMLElement>("[data-autofocus]");
      const hostEditor = autofocusHost?.querySelector<HTMLElement>('[contenteditable="true"]');
      // A field that asked for focus but isn't editable yet (the Markdown
      // editor's first-paint copy) focuses itself once ready; moving focus to
      // a later input meanwhile would scroll the dialog away from it.
      if (autofocusHost && !hostEditor) return;
      const target =
        hostEditor ??
        panel?.querySelector<HTMLElement>('[contenteditable="true"]') ??
        panel?.querySelector<HTMLElement>("[autofocus], input, textarea, select") ??
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
    if (!exiting) return;

    let finished = false;
    const finishClose = () => {
      if (finished) return;
      finished = true;
      if (returnFocus?.isConnected) returnFocus.focus();
      setReturnFocus(null);
      setPresent(false);
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
  }, [exiting, returnFocus]);

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
        <ViewSwap view={view} panelRef={panelRef} />
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
            <div className="shrink-0 border-t border-border px-6 py-4">{content.footer}</div>
          </>
        ) : (
          content.children
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Dissolves a dialog between views instead of snapping. Just before React
 * swaps the DOM, the outgoing view is copied into a frozen, inert ghost; after
 * the swap the incoming view fades in over it while the panel morphs to its
 * new height.
 * Renders nothing; `getSnapshotBeforeUpdate` is React's hook for reading the
 * DOM before an update lands.
 */
class ViewSwap extends React.Component<{
  view: string | undefined;
  panelRef: React.RefObject<HTMLDivElement | null>;
}> {
  ghost: HTMLElement | null = null;

  getSnapshotBeforeUpdate(prev: { view: string | undefined }) {
    const panel = this.props.panelRef.current;
    if (prev.view === this.props.view || !panel) return null;
    this.ghost?.remove();
    // Stop only the swap's own animations; the panel's CSS open animation stays.
    for (const animation of panel.getAnimations({ subtree: true })) {
      if (!(animation instanceof CSSAnimation)) animation.cancel();
    }
    const from = panel.getBoundingClientRect().height;
    const ghost = document.createElement("div");
    ghost.className = panel.className;
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    ghost.append(...Array.from(panel.children, (child) => child.cloneNode(true)));
    for (const node of ghost.querySelectorAll("[id]")) node.removeAttribute("id");
    Object.assign(ghost.style, {
      position: "absolute",
      inset: "0 0 auto 0",
      height: `${from}px`,
      margin: "0",
      border: "0",
      boxShadow: "none",
      background: "transparent",
      pointerEvents: "none",
      animation: "none",
    });
    return { ghost, from };
  }

  componentDidUpdate(
    _prev: unknown,
    _state: unknown,
    snapshot: { ghost: HTMLElement; from: number } | null,
  ) {
    const panel = this.props.panelRef.current;
    if (!snapshot || !panel) return;
    const { ghost, from } = snapshot;
    const to = panel.getBoundingClientRect().height;
    const incoming = Array.from(panel.children) as HTMLElement[];
    // The old view sits underneath; the new one dissolves in on top with the
    // panel's own background, covering it as it arrives. The dialog is never
    // empty mid-swap, which is what read as a flash.
    ghost.style.zIndex = "0";
    panel.prepend(ghost);
    this.ghost = ghost;
    const surface = getComputedStyle(panel).backgroundColor;
    const restore = incoming.map((child) => {
      const { position, zIndex, backgroundColor } = child.style;
      if (getComputedStyle(child).position === "static") child.style.position = "relative";
      child.style.zIndex = "1";
      child.style.backgroundColor = surface;
      return () => Object.assign(child.style, { position, zIndex, backgroundColor });
    });
    const overflow = panel.style.overflow;
    panel.style.overflow = "hidden";
    // While the panel resizes, its scrolling body is squeezed and would flash a
    // scrollbar it doesn't need. Scrolling waits for the final size.
    const scrollers = incoming.filter((child) =>
      /auto|scroll/.test(getComputedStyle(child).overflowY),
    );
    const scrollerStyle = scrollers.map((child) => ({
      overflowY: child.style.overflowY,
      paddingRight: child.style.paddingRight,
    }));
    for (const child of scrollers) {
      // The panel is already at its final size here, so the body's width with
      // its scrollbar (if it will have one) is known. Hold exactly that space
      // while scrolling is off, so the content doesn't shift when it returns.
      const withScrollbar = child.clientWidth;
      child.style.overflowY = "hidden";
      const gutter = child.clientWidth - withScrollbar;
      if (gutter > 0) {
        child.style.paddingRight = `${parseFloat(getComputedStyle(child).paddingRight) + gutter}px`;
      }
    }
    const finish = () => {
      ghost.remove();
      if (this.ghost === ghost) this.ghost = null;
      for (const undo of restore) undo();
      panel.style.overflow = overflow;
      scrollers.forEach((child, index) => {
        Object.assign(child.style, scrollerStyle[index]);
        if (child.scrollHeight <= child.clientHeight) return;
        // The content really overflows: fade the scrollbar in, don't pop it.
        child.animate(
          [
            { scrollbarColor: "transparent transparent" },
            { scrollbarColor: "var(--color-border-strong) transparent" },
          ],
          { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
      });
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fade = { duration: reduce ? 150 : 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
    for (const child of incoming) {
      child.animate([{ opacity: 0 }, { opacity: 1 }], { ...fade, fill: "backwards" });
    }
    if (reduce) {
      // Fewer, gentler: the dissolve alone, no resize.
      window.setTimeout(finish, fade.duration + 10);
      return;
    }
    // An on-screen size change takes the strong ease-in-out. Whatever of the
    // old view the new one doesn't cover fades out under the moving edge.
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: VIEW_SWAP_MS,
      easing: "linear",
      fill: "forwards",
    });
    const morph = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: VIEW_SWAP_MS,
      easing: "cubic-bezier(0.77, 0, 0.175, 1)",
    });
    morph.finished.then(finish, finish);
  }

  componentWillUnmount() {
    this.ghost?.remove();
  }

  render() {
    return null;
  }
}
