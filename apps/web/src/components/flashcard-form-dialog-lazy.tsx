import { useEffect, useState, type ComponentProps } from "react";
import type { FlashcardFormDialog as EagerFlashcardFormDialog } from "@/components/flashcard-form-dialog";

type DialogComponent = typeof EagerFlashcardFormDialog;

let loadedDialog: DialogComponent | null = null;
let dialogPromise: Promise<DialogComponent> | null = null;

const loadDialog = () =>
  (dialogPromise ??= import("@/components/flashcard-form-dialog").then(
    (module) => (loadedDialog = module.FlashcardFormDialog),
    (error: unknown) => {
      // Let the next open retry the download.
      dialogPromise = null;
      throw error;
    },
  ));

/**
 * The card editor (TipTap and ProseMirror) is the largest thing on the deck,
 * browse, graph, and review pages, but it only appears once a dialog opens. This
 * wrapper keeps it out of those pages' first load: the page renders without it,
 * the code downloads while the browser is idle, and the dialog mounts on its
 * first open. Once mounted it stays mounted, so later opens and close
 * animations behave exactly as before.
 *
 * It loads the code itself instead of using `lazy` and `Suspense`: React holds
 * a revealed Suspense boundary back for up to 300ms, which made the first card
 * opened on every page visibly slower than the next ones.
 */
export function FlashcardFormDialog(props: ComponentProps<DialogComponent>) {
  const [mounted, setMounted] = useState(props.open);
  if (props.open && !mounted) setMounted(true);
  const [Dialog, setDialog] = useState(() => loadedDialog);
  const [loadError, setLoadError] = useState<unknown>(null);
  if (loadError) throw loadError;

  useEffect(() => {
    if (Dialog) return;
    let cancelled = false;
    const load = () =>
      void loadDialog().then(
        (component) => !cancelled && setDialog(() => component),
        (error: unknown) => !cancelled && mounted && setLoadError(error),
      );
    // Opened before the idle preload finished: fetch right away.
    if (mounted) {
      load();
      return () => {
        cancelled = true;
      };
    }
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 2000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(load, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [Dialog, mounted]);

  if (!mounted || !Dialog) return null;
  return <Dialog {...props} />;
}
