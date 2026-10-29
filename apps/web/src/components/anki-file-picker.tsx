import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AnkiImportError } from "@/lib/anki/reader";
import { openAnkiImport, type OpenedAnkiFile } from "@/lib/anki/opened-file";

const ACCEPT = ".apkg,.colpkg,.txt,.csv,.tsv";

/** The two import routes: an AI assistant, or a file read in this browser. */
export function AnkiFilePicker({ onOpened }: { onOpened: (file: OpenedAnkiFile) => void }) {
  /** Name of the file being read, or null. */
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = async (file: File | undefined) => {
    if (!file || opening) return;
    setOpening(file.name);
    setError(null);
    try {
      onOpened(await openAnkiImport(file));
    } catch (caught) {
      setError(
        caught instanceof AnkiImportError
          ? caught.message
          : "Armin couldn't read this file. Check that it's an Anki export and try again.",
      );
    } finally {
      setOpening(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => void openFile(event.target.files?.[0])}
      />
      <section
        aria-labelledby="anki-assistant-route"
        className="border border-accent/30 bg-accent-tint/55 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3
              id="anki-assistant-route"
              className="font-serif text-[1.0625rem] font-semibold text-ink"
            >
              Import with an AI assistant
            </h3>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              Recommended. Your assistant converts the file, fixes cards Armin can&apos;t read, and
              waits for your approval before saving.
            </p>
          </div>
          <Bot className="mt-0.5 h-5 w-5 shrink-0 text-accent-deep" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link to="/ai-setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Set up an assistant
          </Link>
          <span className="text-[0.75rem] text-muted">Review progress isn&apos;t kept.</span>
        </div>
      </section>

      <div className="flex items-center gap-3 text-[0.75rem] text-muted">
        <span aria-hidden className="h-px flex-1 bg-border" />
        or import in this browser
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void openFile(event.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-3 border border-dashed px-6 py-6 text-center transition-colors duration-150 ${
          dragging ? "border-accent bg-accent-tint" : "border-border-strong bg-bg-2"
        }`}
      >
        {opening ? (
          <LoaderCircle className="h-6 w-6 animate-spin text-accent-deep" aria-hidden />
        ) : (
          <FileUp className="h-6 w-6 text-accent-deep" strokeWidth={1.5} aria-hidden />
        )}
        <div role="status" aria-live="polite" className="w-full min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {opening ? `Reading ${opening}` : "Drop an Anki file here"}
          </p>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {opening
              ? "Large collections can take up to a minute."
              : ".apkg, .colpkg, .txt, .csv, or .tsv"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(opening)}
          onClick={() => fileInput.current?.click()}
        >
          Choose file
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="flex gap-3 border border-border bg-surface-sunken p-3 text-sm text-ink"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-again" aria-hidden />
          {error}
        </div>
      )}
    </div>
  );
}
