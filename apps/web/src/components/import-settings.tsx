import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnkiImportDialog, preloadAnkiImportDialog } from "@/components/anki-import-dialog-lazy";
import { useConnection } from "@/lib/session";

/** Opens the Anki importer; the dialog and its file reader load on demand. */
export function ImportSettings() {
  const { online } = useConnection();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <p className="text-[0.8125rem] leading-snug text-muted">
        Bring in an Anki deck (.apkg), a full collection (.colpkg), or a plain-text export (.txt,
        .csv, .tsv). Cards, images, and your review progress come with it; audio and video
        don&apos;t.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={!online}
        onClick={() => setOpen(true)}
        onPointerEnter={preloadAnkiImportDialog}
        onFocus={preloadAnkiImportDialog}
      >
        <Upload className="h-4 w-4" />
        Import
      </Button>
      <AnkiImportDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
