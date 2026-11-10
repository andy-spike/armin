import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalIsolation } from "@/keybindings/keybindings-provider";

const EXIT_MS = 200;
const VIEW_SWAP_MS = 250;

function captureReturnFocus() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const menu = active.closest<HTMLElement>('[role="menu"]');
  if (menu?.id) {
    return document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`);
  }
  return active;
}

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
  fullscreen = false,
  headerActions,
}: {
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  view?: string;
  fullscreen?: boolean;
  headerActions?: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  const onExitCompleteRef = React.useRef(onExitComplete);
  const titleId = React.useId();
  const [present, setPresent] = React.useState(open);
  const [wasOpen, setWasOpen] = React.useState(false);
  const [returnFocus, setReturnFocus] = React.useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = React.useState({
    title,
    description,
    children,
    footer,
    headerActions,
  });
  const exiting = present && !open;

  if (open !== wasOpen && typeof document !== "undefined") {
    setWasOpen(open);
    if (open) {
      setPresent(true);
      setReturnFocus(captureReturnFocus());
    }
  }

  useModalIsolation(present);

  if (
    open &&
    (snapshot.title !== title ||
      snapshot.description !== description ||
      snapshot.children !== children ||
      snapshot.footer !== footer ||
      snapshot.headerActions !== headerActions)
  ) {
    setSnapshot({ title, description, children, footer, headerActions });
  }

  const content = exiting ? snapshot : { title, description, children, footer, headerActions };
  const gutter = fullscreen ? "px-[max(1.5rem,calc((100%-72rem)/2))]" : "px-6";

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
      if (panel?.contains(document.activeElement)) return;
      const autofocusHost = panel?.querySelector<HTMLElement>("[data-autofocus]");
      const hostEditor = autofocusHost?.querySelector<HTMLElement>('[contenteditable="true"]');
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
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        fullscreen ? "p-0" : "p-4",
      )}
    >
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
          fullscreen && "h-dvh max-h-dvh w-full max-w-none rounded-none border-0",
        )}
      >
        <ViewSwap view={view} fullscreen={fullscreen} panelRef={panelRef} />
        {content.title && (
          <div
            className={cn(
              "flex items-start justify-between gap-4",
              content.footer
                ? cn("shrink-0 pt-6 pb-4", gutter)
                : "sticky -top-6 z-10 -mx-6 -mt-6 mb-4 rounded-t-lg bg-surface px-6 pt-6 pb-4",
              fullscreen && "border-b border-border",
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
            <div className="-mr-1.5 -mt-1.5 flex shrink-0 items-center gap-1">
              {content.headerActions}
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {content.footer ? (
          <>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6",
                gutter,
                (!content.title || fullscreen) && "pt-6",
              )}
            >
              {content.children}
            </div>
            <div className={cn("shrink-0 border-t border-border py-4", gutter)}>
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

type SwapSnapshot =
  | { kind: "view"; ghost: HTMLElement; from: number }
  | { kind: "resize"; from: DOMRect };

class ViewSwap extends React.Component<
  {
    view: string | undefined;
    fullscreen: boolean;
    panelRef: React.RefObject<HTMLDivElement | null>;
  },
  object,
  SwapSnapshot | null
> {
  ghost: HTMLElement | null = null;

  getSnapshotBeforeUpdate(prev: { view: string | undefined; fullscreen: boolean }) {
    const panel = this.props.panelRef.current;
    const resized = prev.fullscreen !== this.props.fullscreen;
    if ((prev.view === this.props.view && !resized) || !panel) return null;
    this.ghost?.remove();
    this.ghost = null;
    for (const animation of panel.getAnimations({ subtree: true })) {
      if (!(animation instanceof CSSAnimation)) animation.cancel();
    }
    if (resized) return { kind: "resize" as const, from: panel.getBoundingClientRect() };
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
    return { kind: "view" as const, ghost, from };
  }

  componentDidUpdate(_prev: unknown, _state: unknown, snapshot: SwapSnapshot | null) {
    const panel = this.props.panelRef.current;
    if (!snapshot || !panel) return;
    if (snapshot.kind === "resize") {
      resizePanel(panel, snapshot.from);
      return;
    }
    const { ghost, from } = snapshot;
    const to = panel.getBoundingClientRect().height;
    const incoming = Array.from(panel.children) as HTMLElement[];
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
    const scrollers = incoming.filter((child) =>
      /auto|scroll/.test(getComputedStyle(child).overflowY),
    );
    const scrollerStyle = scrollers.map((child) => ({
      overflowY: child.style.overflowY,
      paddingRight: child.style.paddingRight,
    }));
    for (const child of scrollers) {
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
      window.setTimeout(finish, fade.duration + 10);
      return;
    }
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

function resizePanel(panel: HTMLElement, from: DOMRect) {
  const to = panel.getBoundingClientRect();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easing = "cubic-bezier(0.23, 1, 0.32, 1)";
  if (reduce) {
    panel.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 150, easing });
    return;
  }
  if (to.width >= from.width && to.height >= from.height) {
    const clip = (top: number, right: number, bottom: number, left: number, radius: number) =>
      `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;
    panel.animate(
      [
        {
          clipPath: clip(
            from.top - to.top,
            to.right - from.right,
            to.bottom - from.bottom,
            from.left - to.left,
            8,
          ),
        },
        { clipPath: clip(0, 0, 0, 0, 0) },
      ],
      { duration: 300, easing: "cubic-bezier(0.77, 0, 0.175, 1)" },
    );
    return;
  }
  panel.animate(
    [
      { opacity: 0, transform: "scale(1.03)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 200, easing },
  );
}
