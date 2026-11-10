import { createFileRoute } from "@tanstack/react-router";
import { AnkiImportPage } from "@/components/anki-import/anki-import-page";
import { setOpenedAnkiFile } from "@/lib/anki/opened-file";

export const Route = createFileRoute("/_app/import")({
  head: () => ({ meta: [{ title: "Import from Anki · Armin" }] }),
  onLeave: () => setOpenedAnkiFile(null),
  component: AnkiImportPage,
});
