import { useEffect, useState, type ComponentProps } from "react";
import type { FlashcardFormDialog as EagerFlashcardFormDialog } from "@/components/flashcard-form-dialog";

type DialogComponent = typeof EagerFlashcardFormDialog;

let loadedDialog: DialogComponent | null = null;
let dialogPromise: Promise<DialogComponent> | null = null;

const loadDialog = () =>
  (dialogPromise ??= import("@/components/flashcard-form-dialog").then(
    (module) => (loadedDialog = module.FlashcardFormDialog),
    (error: unknown) => {
      dialogPromise = null;
      throw error;
    },
  ));

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
