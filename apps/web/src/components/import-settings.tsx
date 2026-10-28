import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnkiImportDialog } from "@/components/anki-import-dialog";
import { useConnection } from "@/lib/session";

/** Opens the Anki importer; the file reader loads after a file is chosen. */
export function ImportSettings() {
  const { online } = useConnection();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <p className="text-[0.8125rem] leading-snug text-muted">
        Import an Anki deck (.apkg), a full collection (.colpkg), or a plain-text export (.txt,
        .csv, .tsv). You can hand the file to a connected AI assistant for a guided,
        image-preserving import, or convert it in this browser now. Cards, images, and your review
        progress come with the browser route; audio and video don&apos;t.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={!online}
        onClick={() => setOpen(true)}
      >
        <Upload className="h-4 w-4" />
        Import
      </Button>
      <AnkiImportDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
