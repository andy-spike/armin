import { useNavigate } from "@tanstack/react-router";
import { AnkiFilePicker } from "@/components/anki-file-picker";
import { Dialog } from "@/components/ui/dialog";
import { setOpenedAnkiFile } from "@/lib/anki/opened-file";

/** Picks an Anki file, then hands it to the import page to choose decks and import. */
export function AnkiImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import from Anki"
      description="Bring your Anki decks into Armin."
      className="max-w-xl"
    >
      <AnkiFilePicker
        onOpened={(file) => {
          setOpenedAnkiFile(file);
          onClose();
          void navigate({ to: "/import" });
        }}
      />
    </Dialog>
  );
}
