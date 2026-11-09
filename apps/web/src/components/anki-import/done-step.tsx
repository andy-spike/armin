import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Copy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import { useToast } from "@/components/ui/toast";
import { type ImportSummary } from "@/lib/anki/import-runner";
import { n, plural } from "./format";

export function DoneStep({
  summary,
  skippedNotes,
  fileName,
  onImportAnother,
}: {
  summary: ImportSummary;
  skippedNotes: number;
  fileName: string;
  onImportAnother: () => void;
}) {
  const leftOut = [
    summary.skippedCards > 0 &&
      `${plural(summary.skippedCards, "card")} left out because an image they need couldn't be imported`,
    skippedNotes > 0 && `${plural(skippedNotes, "note")} skipped for having no usable content`,
    summary.skippedImages > 0 &&
      `${plural(summary.skippedImages, "media file")} left out (unsupported, too large, or missing)`,
  ].filter(Boolean);
  const only = summary.decks.length === 1 ? summary.decks[0] : null;

  return (
    <section
      aria-labelledby="anki-done"
      data-narrow
      className="border border-border bg-surface shadow-overlay"
    >
      <div role="status" className="flex items-start gap-4 px-6 pt-6">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center border border-good/40 bg-good/10 text-good"
        >
          <Check className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="anki-done"
            className="font-serif text-[1.375rem] font-semibold tracking-tight text-ink"
          >
            Import complete
          </h2>
          <p className="mt-1 truncate text-[0.8125rem] text-muted">{fileName}</p>
        </div>
      </div>

      <dl className="mt-5 flex border-y border-border">
        {[
          ["Cards", summary.flashcards],
          ["Decks", summary.decks.length],
          ...(summary.reviewLogs > 0 ? [["Past reviews", summary.reviewLogs] as const] : []),
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 flex-1 border-r border-border px-6 py-4 last:border-r-0"
          >
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 font-serif text-2xl font-semibold text-ink tabular-nums">
              {n(Number(value))}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="divide-y divide-border">
        {summary.decks.map((deck) => (
          <li key={deck.id}>
            <Link
              to="/deck/$deckId"
              params={{ deckId: deck.id }}
              className="group flex items-center gap-3 px-6 py-3 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <TruncatedLabel label={deck.name} className="text-sm text-ink" />
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {plural(deck.cards, "card")}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>

      <PrerequisitePrompt decks={summary.decks.map((deck) => deck.name)} />

      {leftOut.length > 0 && (
        <div className="border-t border-border bg-bg-2 px-6 py-4 text-[0.8125rem]">
          <p className="font-medium text-ink">Left out</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {leftOut.map((line) => (
              <li key={String(line)}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button variant="ghost" size="sm" onClick={onImportAnother}>
          Import another file
        </Button>
        {only ? (
          <Link
            to="/deck/$deckId"
            params={{ deckId: only.id }}
            className={buttonVariants({ size: "sm" })}
          >
            Open deck
          </Link>
        ) : (
          <Link to="/" className={buttonVariants({ size: "sm" })}>
            Go to decks
          </Link>
        )}
      </div>
    </section>
  );
}

function prerequisitePrompt(decks: string[]) {
  const list = decks.map((deck) => `"${deck}"`).join(", ");
  return `In Armin, look through the cards in ${decks.length === 1 ? "my deck" : "my decks"} ${list}, which I just imported from Anki. Suggest prerequisite links where one card is clearly needed to understand another, and explain each suggestion. Show me the list first and only link the ones I approve.`;
}

function PrerequisitePrompt({ decks }: { decks: string[] }) {
  const toast = useToast();
  const prompt = prerequisitePrompt(decks);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: "Prompt copied", description: "Paste it into your AI assistant." });
    } catch {
      toast({ tone: "error", title: "Couldn't copy the prompt" });
    }
  };
  return (
    <div className="border-t border-border px-6 py-4 text-[0.8125rem]">
      <p className="font-medium text-ink">Next: connect your cards</p>
      <p className="mt-1 text-muted">
        Imported cards start without prerequisites. An AI assistant connected to Armin can suggest
        which cards build on which, and link the ones you approve.
      </p>
      <p className="mt-2 border border-border bg-bg-2 px-3 py-2 text-ink">{prompt}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy prompt
        </Button>
        <Link to="/ai-setup" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Set up an AI assistant
        </Link>
      </div>
    </div>
  );
}
