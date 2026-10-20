import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import type { FlashcardFormDialog as EagerFlashcardFormDialog } from "@/components/flashcard-form-dialog";

const loadDialog = () => import("@/components/flashcard-form-dialog");

const LazyDialog = lazy(() =>
  loadDialog().then((module) => ({ default: module.FlashcardFormDialog })),
);

/**
 * The card editor (TipTap and ProseMirror) is the largest thing on the deck,
 * browse, graph, and review pages, but it only appears once a dialog opens. This
 * wrapper keeps it out of those pages' first load: the page renders without it,
 * the code downloads while the browser is idle, and the dialog mounts on its
 * first open. Once mounted it stays mounted, so later opens and close
 * animations behave exactly as before.
 */
export function FlashcardFormDialog(props: ComponentProps<typeof EagerFlashcardFormDialog>) {
  const [mounted, setMounted] = useState(props.open);
  if (props.open && !mounted) setMounted(true);

  useEffect(() => {
    if (mounted) return;
    const preload = () => void loadDialog();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 500);
    return () => clearTimeout(id);
  }, [mounted]);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LazyDialog {...props} />
    </Suspense>
  );
}
