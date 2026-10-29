import { createFileRoute } from "@tanstack/react-router";
import { AnkiImportPage } from "@/components/anki-import-page";
import { setOpenedAnkiFile } from "@/lib/anki/opened-file";

export const Route = createFileRoute("/_app/import")({
  head: () => ({ meta: [{ title: "Import from Anki · Armin" }] }),
  // The open file's worker holds the whole collection; free it once the page is gone.
  onLeave: () => setOpenedAnkiFile(null),
  component: AnkiImportPage,
});
