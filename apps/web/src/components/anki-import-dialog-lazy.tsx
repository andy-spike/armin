import { lazy, Suspense, useState, type ComponentProps } from "react";
import type { AnkiImportDialog as EagerAnkiImportDialog } from "@/components/anki-import-dialog";

const loadDialog = () => import("@/components/anki-import-dialog");

const LazyDialog = lazy(() =>
  loadDialog().then((module) => ({ default: module.AnkiImportDialog })),
);

/** Start downloading the importer (and its converter) before the first click. */
export const preloadAnkiImportDialog = () => void loadDialog();

/**
 * Importing is rare, so the dialog, the converter, and the Anki file reader stay
 * out of every page's first load. The code downloads on the first open (or on
 * hover and focus of an entry point, via `preloadAnkiImportDialog`) and stays
 * mounted afterwards so the close animation and any running import behave
 * normally. The SQLite reader itself lives in a Web Worker chunk that only
 * loads once a file is chosen.
 */
export function AnkiImportDialog(props: ComponentProps<typeof EagerAnkiImportDialog>) {
  const [mounted, setMounted] = useState(props.open);
  if (props.open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LazyDialog {...props} />
    </Suspense>
  );
}
