import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Check, FileUp, LoaderCircle, TriangleAlert, Bot } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import { convertAnkiCollection, type ImportDeck, type ImportPlan } from "@armin/core/anki";
import type { FlashcardType } from "@armin/core/flashcard-types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/toast";
import { CARD_TYPE_LABELS } from "@/components/flashcard-type-badge";
import { convexClient, errorMessage } from "@/lib/armin-client";
import { AnkiImportError, openAnkiFile, type AnkiReader } from "@/lib/anki/reader";
import {
  ImportCancelledError,
  importErrorMessage,
  runImport,
  uniqueDeckNames,
  type ImportProgress,
  type ImportSummary,
} from "@/lib/anki/import-runner";

const ACCEPT = ".apkg,.colpkg,.txt,.csv,.tsv";

type Source = {
  reader: AnkiReader;
  fileName: string;
  fileSize: number;
  openedAt: number;
  /** Every deck the file offers, for the checklist; selection only changes the plan. */
  decks: ImportDeck[];
  initialPlan: ImportPlan;
};

type Step = "choose" | "preview" | "importing" | "done" | "failed";
type ProgressMode = "keep" | "fresh";

const formatCount = (value: number) => value.toLocaleString();
const plural = (value: number, noun: string) =>
  `${formatCount(value)} ${noun}${value === 1 ? "" : "s"}`;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Why the selected plan can't be imported into this library, as user-facing sentences. */
function limitProblems(plan: ImportPlan, usage: Usage) {
  const { limits } = usage;
  const found: string[] = [];
  const hasMultiUnit = plan.totals.reviewUnits > plan.totals.flashcards;
  const room = (limit: number, used: number) => Math.max(0, limit - used);
  if (usage.decks + plan.decks.length > limits.decks)
    found.push(
      `These ${plural(plan.decks.length, "deck")} would bring your library to ${formatCount(usage.decks + plan.decks.length)} decks; the beta allows ${formatCount(limits.decks)}.`,
    );
  if (usage.flashcards + plan.totals.flashcards > limits.flashcards)
    found.push(
      `This adds ${formatCount(plan.totals.flashcards)} flashcards, but your library has room for ${formatCount(room(limits.flashcards, usage.flashcards))} more (the beta allows ${formatCount(limits.flashcards)}).`,
    );
  if (usage.reviewUnits + plan.totals.reviewUnits > limits.reviewUnits)
    found.push(
      `This adds ${formatCount(plan.totals.reviewUnits)} review items, but your library has room for ${formatCount(room(limits.reviewUnits, usage.reviewUnits))} more (the beta allows ${formatCount(limits.reviewUnits)}). ${hasMultiUnit ? " Cloze and reversed cards count once per blank or direction." : ""}`,
    );
  if (plan.totals.reviewLogs > limits.reviewLogs)
    found.push(
      `This carries ${formatCount(plan.totals.reviewLogs)} past reviews; an import can bring at most ${formatCount(limits.reviewLogs)}. Choose “Start fresh” to leave review history behind.`,
    );
  return found;
}

export function AnkiImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("choose");
  const [opening, setOpening] = useState(false);
  const [chooseError, setChooseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState<ProgressMode>("keep");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const readerRef = useRef<AnkiReader | null>(null);
  // Each file the user picks supersedes any file still being read.
  const openToken = useRef(0);

  const previewing = step === "preview";

  useEffect(() => () => readerRef.current?.close(), []);

  const reset = () => {
    openToken.current++;
    readerRef.current?.close();
    readerRef.current = null;
    abort.current = null;
    setStep("choose");
    setOpening(false);
    setChooseError(null);
    setDragging(false);
    setSource(null);
    setSelected(new Set());
    setMode("keep");
    setProgress(null);
    setConfirmStop(false);
    setSummary(null);
    setFailure(null);
  };

  const openFile = async (file: File | undefined) => {
    if (!file || opening) return;
    const token = ++openToken.current;
    setOpening(true);
    setChooseError(null);
    let reader: AnkiReader | null = null;
    try {
      reader = await openAnkiFile(file);
      // Let "Reading your file" paint before the converter holds the main thread.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const openedAt = Date.now();
      const initialPlan = convertAnkiCollection(reader.collection, {
        progress: "keep",
        now: openedAt,
      });
      if (token !== openToken.current) {
        reader.close();
        return;
      }
      if (initialPlan.decks.length === 0) {
        reader.close();
        setChooseError(
          "This file doesn't contain any cards Armin can import. Check that it's an Anki export with at least one note.",
        );
        return;
      }
      readerRef.current?.close();
      readerRef.current = reader;
      setSource({
        reader,
        fileName: file.name,
        fileSize: file.size,
        openedAt,
        decks: initialPlan.decks,
        initialPlan,
      });
      setSelected(new Set(initialPlan.decks.map((deck) => deck.key)));
      setMode("keep");
      setStep("preview");
    } catch (error) {
      reader?.close();
      if (token === openToken.current) {
        setChooseError(
          error instanceof AnkiImportError
            ? error.message
            : "Armin couldn't read this file. Check that it's an Anki export and try again.",
        );
      }
    } finally {
      if (token === openToken.current) setOpening(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // Converting 30,000 cards takes a moment, so the checkbox paints first and the
  // plan follows from the deferred selection.
  const deferredSelected = useDeferredValue(selected);
  const deferredMode = useDeferredValue(mode);
  const plan = useMemo(() => {
    if (!source) return null;
    if (deferredSelected.size === source.decks.length && deferredMode === "keep")
      return source.initialPlan;
    return convertAnkiCollection(source.reader.collection, {
      progress: deferredMode,
      deckIds: [...deferredSelected],
      now: source.openedAt,
    });
  }, [source, deferredSelected, deferredMode]);
  const planStale = selected !== deferredSelected || mode !== deferredMode;

  const usage = useQuery({ ...convexQuery(api.imports.usage, {}), enabled: previewing });
  const running = useQuery({ ...convexQuery(api.imports.current, {}), enabled: previewing });
  const cancelOther = useMutation({
    mutationFn: (importId: Id<"imports">) =>
      convexClient().mutation(api.imports.cancel, {
        importId,
        reason: "Cancelled to start another import.",
      }),
    onError: (error) =>
      toast({
        tone: "error",
        title: "Couldn't cancel the import",
        description: errorMessage(error),
      }),
  });

  const problems = useMemo(
    () => (plan && usage.data ? limitProblems(plan, usage.data) : []),
    [plan, usage.data],
  );

  const names = useMemo(() => {
    const map = new Map<string, string>();
    if (!plan) return map;
    const unique = uniqueDeckNames(plan.decks);
    plan.decks.forEach((deck, index) => map.set(deck.key, unique[index]));
    return map;
  }, [plan]);

  const toggleDeck = (key: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const start = async () => {
    if (!source || !plan) return;
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    setConfirmStop(false);
    setProgress({
      stage: plan.totals.mediaFiles > 0 ? "images" : "cards",
      images: { done: 0, total: plan.totals.mediaFiles },
      cards: { done: 0, total: plan.totals.flashcards },
      history: { done: 0, total: plan.totals.reviewLogs },
    });
    setStep("importing");
    try {
      const result = await runImport({
        plan,
        reader: source.reader,
        fileName: source.fileName,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setSummary(result);
      setStep("done");
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "convexQuery",
      });
    } catch (error) {
      if (error instanceof ImportCancelledError) {
        setStep("preview");
        toast({ title: "Import cancelled", description: "Nothing was added to your library." });
      } else {
        setFailure(importErrorMessage(error));
        setStep("failed");
      }
    } finally {
      abort.current = null;
      setConfirmStop(false);
    }
  };

  // Escape, the backdrop, and the close button all ask first while work is running.
  const requestClose = () => {
    if (step === "importing") setConfirmStop(true);
    else onClose();
  };

  const skippedNotes = plan?.warnings.find((w) => w.code === "empty_note_skipped")?.count ?? 0;
  const blocked = problems.length > 0 || Boolean(running.data);
  const canImport =
    previewing && plan && plan.decks.length > 0 && !planStale && usage.data && !blocked;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  let description = "Bring your decks, cards, images, and progress over from Anki.";

  if (step === "choose") {
    body = (
      <ChooseStep
        opening={opening}
        error={chooseError}
        dragging={dragging}
        setDragging={setDragging}
        onPick={() => fileInput.current?.click()}
        onFile={(file) => void openFile(file)}
      />
    );
    footer = (
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  } else if (step === "preview" && source && plan) {
    description = "Choose what to bring over. Nothing is added until you press Import.";
    body = (
      <PreviewStep
        source={source}
        plan={plan}
        stale={planStale}
        selected={selected}
        names={names}
        mode={mode}
        onMode={setMode}
        onToggle={toggleDeck}
        onSelectAll={(all) =>
          setSelected(all ? new Set(source.decks.map((deck) => deck.key)) : new Set())
        }
        usage={usage.data ?? undefined}
        problems={problems}
        otherImport={running.data ?? null}
        cancellingOther={cancelOther.isPending}
        onCancelOther={() => running.data && cancelOther.mutate(running.data.id)}
      />
    );
    footer = (
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            reset();
          }}
        >
          Choose another file
        </Button>
        <Button disabled={!canImport} onClick={() => void start()}>
          Import
        </Button>
      </div>
    );
  } else if (step === "importing" && progress) {
    description = "Keep this tab open until it finishes.";
    body = <ImportingStep progress={progress} />;
    footer = confirmStop ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Stop now? Everything added so far will be removed.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setConfirmStop(false)}>
            Keep importing
          </Button>
          <Button variant="destructive" onClick={() => abort.current?.abort()}>
            Stop import
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setConfirmStop(true)}>
          Cancel import
        </Button>
      </div>
    );
  } else if (step === "done" && summary) {
    description = "Your cards are ready.";
    body = <DoneStep summary={summary} skippedNotes={skippedNotes} onNavigate={onClose} />;
    footer = (
      <div className="flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    );
  } else if (step === "failed") {
    description = "Something went wrong.";
    body = (
      <div role="alert" className="flex gap-3 border border-border bg-surface-sunken p-4 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-again" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium text-ink">The import didn&apos;t finish.</p>
          <p className="text-muted">{failure}</p>
        </div>
      </div>
    );
    footer = (
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="outline" onClick={() => setStep("preview")}>
          Back to preview
        </Button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => void openFile(event.target.files?.[0])}
      />
      <Dialog
        open={open}
        onClose={requestClose}
        onExitComplete={reset}
        title="Import from Anki"
        description={description}
        className="max-w-xl"
        footer={footer}
      >
        {body}
      </Dialog>
    </>
  );
}

function ChooseStep({
  opening,
  error,
  dragging,
  setDragging,
  onPick,
  onFile,
}: {
  opening: boolean;
  error: string | null;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  onPick: () => void;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <div className="space-y-5">
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
              Import with an AI assistant · Recommended
            </h3>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              The assistant runs Armin&apos;s converter, shows what changed, and can repair
              unsupported cards or skip them only when you ask.
            </p>
          </div>
          <Bot className="mt-0.5 h-5 w-5 shrink-0 text-accent-deep" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link to="/ai-setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Set up an assistant
          </Link>
          <span className="text-[0.75rem] text-muted">Imported cards start fresh.</span>
        </div>
        <details className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          <summary className="cursor-pointer text-ink">How assistant import works</summary>
          <p className="mt-2">
            Connect an assistant from AI setup in the sidebar, give it your Anki file, and ask it to
            import into Armin. It needs file access and a workspace that can run Node.js. You review
            the converted cards and approve them before they appear in your library. Ask for repairs
            or polishing whenever you need them.
          </p>
        </details>
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
          onFile(event.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-3 border border-dashed px-6 py-8 text-center transition-colors duration-150 ${
          dragging ? "border-accent bg-accent-tint" : "border-border-strong bg-bg-2"
        }`}
      >
        <FileUp className="h-6 w-6 text-accent-deep" strokeWidth={1.5} aria-hidden />
        <div>
          <p className="text-sm font-medium text-ink">Drop an Anki file here</p>
          <p className="mt-1 text-[0.8125rem] text-muted">
            Anki decks and collections (.apkg, .colpkg), or text exports (.txt, .csv, .tsv).
          </p>
        </div>
        <Button variant="outline" busy={opening} onClick={onPick}>
          Choose file
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-[0.8125rem] text-muted">
        {opening && (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Reading your file. Large collections can take a moment.
          </span>
        )}
      </p>
      {error && (
        <div
          role="alert"
          className="flex gap-3 border border-border bg-surface-sunken p-3 text-sm text-ink"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-again" aria-hidden />
          {error}
        </div>
      )}
      <p className="text-[0.8125rem] text-muted">
        Browser imports read the file locally. Audio and video aren&apos;t supported, and decks you
        pick are added next to your existing ones. Keep this tab open while a browser import runs.
      </p>
    </div>
  );
}

type Usage = NonNullable<FunctionReturnType<typeof api.imports.usage>>;

function PreviewStep({
  source,
  plan,
  stale,
  selected,
  names,
  mode,
  onMode,
  onToggle,
  onSelectAll,
  usage,
  problems,
  otherImport,
  cancellingOther,
  onCancelOther,
}: {
  source: Source;
  plan: ImportPlan;
  stale: boolean;
  selected: ReadonlySet<string>;
  names: Map<string, string>;
  mode: ProgressMode;
  onMode: (mode: ProgressMode) => void;
  onToggle: (key: string, checked: boolean) => void;
  onSelectAll: (all: boolean) => void;
  usage: Usage | undefined;
  problems: string[];
  otherImport: { fileName: string } | null;
  cancellingOther: boolean;
  onCancelOther: () => void;
}) {
  const allSelected = selected.size === source.decks.length;
  const types = (Object.entries(plan.totals.byType) as [FlashcardType, number][])
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${CARD_TYPE_LABELS[type]} ${formatCount(count)}`);
  const historyCount = source.initialPlan.totals.reviewLogs;

  return (
    <div className="space-y-6">
      <p className="text-[0.8125rem] text-muted">
        <span className="font-medium text-ink">{source.fileName}</span> ·{" "}
        {formatBytes(source.fileSize)}
      </p>

      <section aria-labelledby="anki-decks" className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 id="anki-decks" className="text-sm font-semibold text-ink">
            Decks
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted">
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && selected.size > 0}
              onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
            />
            {selected.size} of {source.decks.length} selected
          </label>
        </div>
        <ul className="max-h-60 divide-y divide-border overflow-y-auto border border-border">
          {source.decks.map((deck) => {
            const armName = names.get(deck.key) ?? deck.name;
            return (
              <li key={deck.key}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-sunken">
                  <Checkbox
                    checked={selected.has(deck.key)}
                    onCheckedChange={(checked) => onToggle(deck.key, Boolean(checked))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[0.9375rem] font-semibold text-ink">
                      {armName}
                    </span>
                    {deck.ankiName !== armName && (
                      <span className="block truncate text-xs text-muted">
                        From {deck.ankiName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {plural(deck.cardCount, "card")}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-label="What will be imported"
        aria-live="polite"
        className={stale ? "opacity-60 transition-opacity" : "transition-opacity"}
      >
        {plan.decks.length === 0 ? (
          <p className="text-sm text-muted">Select at least one deck to import.</p>
        ) : (
          <>
            <p className="text-sm text-ink">
              <span className="font-medium">{plural(plan.totals.flashcards, "flashcard")}</span>
              {" in "}
              {plural(plan.decks.length, "deck")}
              {plan.totals.mediaFiles > 0 && `, with ${plural(plan.totals.mediaFiles, "image")}`}
            </p>
            {types.length > 0 && (
              <p className="mt-1 text-[0.8125rem] text-muted">{types.join(" · ")}</p>
            )}
          </>
        )}
      </section>

      {plan.warnings.length > 0 && (
        <section aria-labelledby="anki-warnings" className="space-y-2">
          <h3 id="anki-warnings" className="text-sm font-semibold text-ink">
            What changes on the way in
          </h3>
          <ul className="space-y-1.5 text-[0.8125rem] text-muted">
            {plan.warnings.map((warning) => (
              <li key={warning.code} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 bg-muted" />
                {warning.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {source.reader.collection.format !== "text" && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-ink">Your progress</legend>
          <RadioGroup value={mode} onValueChange={(value) => onMode(value as ProgressMode)}>
            <label
              htmlFor="anki-progress-keep"
              className="flex cursor-pointer items-start gap-3 border border-border px-3 py-2.5 hover:bg-surface-sunken has-data-checked:border-accent has-data-checked:bg-accent-tint"
            >
              <RadioGroupItem id="anki-progress-keep" value="keep" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-ink">Keep my Anki progress</span>
                <span className="block text-[0.8125rem] text-muted">
                  {historyCount > 0
                    ? `Due dates and ${plural(historyCount, "past review")} come with the cards.`
                    : "Due dates come with the cards. This file has no review history."}
                </span>
              </span>
            </label>
            <label
              htmlFor="anki-progress-fresh"
              className="flex cursor-pointer items-start gap-3 border border-border px-3 py-2.5 hover:bg-surface-sunken has-data-checked:border-accent has-data-checked:bg-accent-tint"
            >
              <RadioGroupItem id="anki-progress-fresh" value="fresh" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-ink">Start fresh</span>
                <span className="block text-[0.8125rem] text-muted">
                  Every card starts as new, with no review history.
                </span>
              </span>
            </label>
          </RadioGroup>
        </fieldset>
      )}

      <section aria-label="Library limits" className="space-y-2 border-t border-border pt-4">
        {usage ? (
          <p className="text-[0.8125rem] text-muted tabular-nums">
            Your library: {formatCount(usage.decks)} of {formatCount(usage.limits.decks)} decks ·{" "}
            {formatCount(usage.flashcards)} of {formatCount(usage.limits.flashcards)} flashcards ·{" "}
            {formatCount(usage.reviewUnits)} of {formatCount(usage.limits.reviewUnits)} review items
          </p>
        ) : (
          <p className="text-[0.8125rem] text-muted">Checking your library…</p>
        )}
        {problems.length > 0 && (
          <div
            role="alert"
            className="space-y-1.5 border border-border bg-surface-sunken p-3 text-sm"
          >
            <p className="flex items-center gap-2 font-medium text-ink">
              <TriangleAlert className="h-4 w-4 shrink-0 text-again" aria-hidden />
              This selection is too large to import
            </p>
            {problems.map((problem) => (
              <p key={problem} className="text-muted">
                {problem}
              </p>
            ))}
            <p className="text-muted">
              {source.decks.length > 1
                ? "Deselect some decks above to bring this under the limit."
                : "This file has a single deck. Split it into smaller decks in Anki, export them separately, and import them one at a time."}
            </p>
          </div>
        )}
        {otherImport && (
          <div
            role="alert"
            className="space-y-2 border border-border bg-surface-sunken p-3 text-sm"
          >
            <p className="text-muted">
              Another import ({otherImport.fileName}) is still running, maybe in another tab. Wait
              for it to finish, or cancel it to start this one.
            </p>
            <Button variant="outline" size="sm" busy={cancellingOther} onClick={onCancelOther}>
              Cancel the other import
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function ImportingStep({ progress }: { progress: ImportProgress }) {
  const phases = [
    { stage: "images", label: "Uploading images", counter: progress.images },
    { stage: "cards", label: "Adding cards", counter: progress.cards },
    { stage: "history", label: "Adding review history", counter: progress.history },
  ] as const;
  const order = ["images", "cards", "history", "finishing"];
  const current = order.indexOf(progress.stage);
  const visible = phases.filter(
    (phase) => phase.counter.total > 0 || phase.stage === progress.stage,
  );
  const active = phases.find((phase) => phase.stage === progress.stage);

  return (
    <div className="space-y-5">
      <p role="status" aria-live="polite" className="sr-only">
        {progress.stage === "finishing" ? "Finishing up" : active?.label}
      </p>
      <ul className="space-y-4">
        {visible.map((phase) => {
          const index = order.indexOf(phase.stage);
          const state = index < current ? "done" : index === current ? "active" : "waiting";
          return (
            <li key={phase.stage} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                {state === "done" ? (
                  <Check className="h-4 w-4 text-good" aria-hidden />
                ) : state === "active" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden />
                ) : (
                  <span className="h-4 w-4" aria-hidden />
                )}
                <span className={state === "waiting" ? "text-muted" : "font-medium text-ink"}>
                  {phase.label}
                </span>
                <span className="ml-auto font-mono text-[0.8125rem] text-muted tabular-nums">
                  {formatCount(phase.counter.done)} / {formatCount(phase.counter.total)}
                </span>
              </div>
              <Progress
                value={state === "done" ? 1 : phase.counter.done}
                max={state === "done" ? 1 : phase.counter.total}
                label={phase.label}
              />
            </li>
          );
        })}
      </ul>
      {progress.stage === "finishing" && (
        <p className="text-[0.8125rem] text-muted">Finishing up…</p>
      )}
    </div>
  );
}

function DoneStep({
  summary,
  skippedNotes,
  onNavigate,
}: {
  summary: ImportSummary;
  skippedNotes: number;
  onNavigate: () => void;
}) {
  const shown = summary.decks.slice(0, 8);
  const leftOut = [
    summary.skippedCards > 0 &&
      `${plural(summary.skippedCards, "card")} left out because an image they need couldn't be imported`,
    skippedNotes > 0 && `${plural(skippedNotes, "note")} skipped for having no usable content`,
    summary.skippedImages > 0 &&
      `${plural(summary.skippedImages, "image")} left out (unsupported, too large, or missing)`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div role="status" className="flex items-start gap-3">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-good" aria-hidden />
        <div>
          <p className="text-sm font-medium text-ink">
            Imported {plural(summary.flashcards, "flashcard")} into{" "}
            {plural(summary.decks.length, "deck")}.
          </p>
          {summary.reviewLogs > 0 && (
            <p className="mt-0.5 text-[0.8125rem] text-muted">
              {plural(summary.reviewLogs, "past review")} came along as history.
            </p>
          )}
        </div>
      </div>
      <ul className="divide-y divide-border border border-border">
        {shown.map((deck) => (
          <li key={deck.id}>
            <Link
              to="/deck/$deckId"
              params={{ deckId: deck.id }}
              onClick={onNavigate}
              className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="min-w-0 truncate font-serif text-[0.9375rem] font-semibold text-ink">
                {deck.name}
              </span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {plural(deck.cards, "card")}
              </span>
            </Link>
          </li>
        ))}
        {summary.decks.length > shown.length && (
          <li className="px-3 py-2.5 text-xs text-muted">
            and {summary.decks.length - shown.length} more on your{" "}
            <Link
              to="/"
              onClick={onNavigate}
              className="font-medium text-accent hover:text-accent-deep"
            >
              decks page
            </Link>
          </li>
        )}
      </ul>
      {leftOut.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">Left out</p>
          <ul className="space-y-1 text-[0.8125rem] text-muted">
            {leftOut.map((line) => (
              <li key={String(line)}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
