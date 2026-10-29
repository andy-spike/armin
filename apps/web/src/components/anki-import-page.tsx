import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Check, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import type { ImportPlan, ImportWarning, ImportWarningCode } from "@armin/core/anki";
import { AnkiFilePicker } from "@/components/anki-file-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import { useToast } from "@/components/ui/toast";
import { convexClient, errorMessage } from "@/lib/armin-client";
import { getOpenedAnkiFile, setOpenedAnkiFile, type OpenedAnkiFile } from "@/lib/anki/opened-file";
import {
  ImportCancelledError,
  importErrorMessage,
  runImport,
  uniqueDeckNames,
  type ImportProgress,
  type ImportSummary,
} from "@/lib/anki/import-runner";

type Step = "preview" | "importing" | "done" | "failed";
type ProgressMode = "keep" | "fresh";

const n = (value: number) => value.toLocaleString();
const plural = (value: number, noun: string) => `${n(value)} ${noun}${value === 1 ? "" : "s"}`;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * The Anki import page: pick decks and progress, then watch the import run.
 * It starts from the file the import dialog opened, or offers the picker when
 * there is none (a reload, or a direct visit).
 */
export function AnkiImportPage() {
  const [source, setSource] = useState<OpenedAnkiFile | null>(getOpenedAnkiFile);

  const open = (file: OpenedAnkiFile) => {
    setOpenedAnkiFile(file);
    setSource(file);
  };

  // One centered column for every single-panel step; the two-column deck
  // picker (no `data-narrow`) uses the full content width.
  return (
    <div className="has-data-narrow:mx-auto has-data-narrow:max-w-2xl">
      {source ? (
        <ImportFlow
          key={source.openedAt}
          source={source}
          onChooseAnother={() => {
            setOpenedAnkiFile(null);
            setSource(null);
          }}
        />
      ) : (
        <>
          <PageHeader description="Bring your Anki decks into Armin." />
          <div data-narrow>
            <AnkiFilePicker onOpened={open} />
          </div>
        </>
      )}
    </div>
  );
}

function PageHeader({ description }: { description: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Import from Anki</h1>
      <p className="mt-1.5 text-sm text-muted">{description}</p>
    </header>
  );
}

function ImportFlow({
  source,
  onChooseAnother,
}: {
  source: OpenedAnkiFile;
  onChooseAnother: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("preview");
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(source.decks.map((deck) => deck.key)),
  );
  const [mode, setMode] = useState<ProgressMode>("keep");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const previewing = step === "preview";

  // Converting 30,000 cards takes a moment, so it runs in the reader's worker. The
  // last plan stays on screen, dimmed, until the one for the current choices arrives.
  const planKey = `${mode}|${[...selected].sort().join(",")}`;
  const usesInitialPlan = selected.size === source.decks.length && mode === "keep";
  const [converted, setConverted] = useState<{ key: string; plan: ImportPlan } | null>(null);
  const plan = usesInitialPlan ? source.initialPlan : (converted?.plan ?? source.initialPlan);
  const planStale = !usesInitialPlan && converted?.key !== planKey;
  useEffect(() => {
    if (usesInitialPlan) return;
    let current = true;
    // A short pause lets several quick checkbox clicks share one conversion.
    const timer = setTimeout(() => {
      source.reader.convert({ progress: mode, deckIds: [...selected], now: source.openedAt }).then(
        (next) => current && setConverted({ key: planKey, plan: next }),
        () => {},
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [source, usesInitialPlan, selected, mode, planKey]);

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

  const problems = useMemo(() => {
    if (!usage.data) return [];
    const { limits } = usage.data;
    const found: string[] = [];
    const hasMultiUnit = plan.totals.reviewUnits > plan.totals.flashcards;
    const room = (limit: number, used: number) => Math.max(0, limit - used);
    if (usage.data.decks + plan.decks.length > limits.decks)
      found.push(
        `${plural(plan.decks.length, "deck")}, room for ${n(room(limits.decks, usage.data.decks))}`,
      );
    if (usage.data.flashcards + plan.totals.flashcards > limits.flashcards)
      found.push(
        `${plural(plan.totals.flashcards, "card")}, room for ${n(room(limits.flashcards, usage.data.flashcards))}`,
      );
    if (usage.data.reviewUnits + plan.totals.reviewUnits > limits.reviewUnits)
      found.push(
        `${plural(plan.totals.reviewUnits, "review item")}, room for ${n(room(limits.reviewUnits, usage.data.reviewUnits))}${hasMultiUnit ? " (cloze and reversed cards count once per blank or side)" : ""}`,
      );
    if (plan.totals.reviewLogs > limits.reviewLogs)
      found.push(
        `${plural(plan.totals.reviewLogs, "past review")}, limit ${n(limits.reviewLogs)}; start cards as new instead`,
      );
    return found;
  }, [plan, usage.data]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
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

  // Leaving the page while cards are being added asks first, like closing the tab.
  const blocker = useBlocker({
    shouldBlockFn: () => step === "importing",
    enableBeforeUnload: () => step === "importing",
    withResolver: true,
  });

  const skippedNotes = plan.warnings.find((w) => w.code === "empty_note_skipped")?.count ?? 0;
  const blocked = problems.length > 0 || Boolean(running.data);
  const canImport = previewing && plan.decks.length > 0 && !planStale && usage.data && !blocked;

  const stopDialog = (
    <Dialog
      open={confirmStop || blocker.status === "blocked"}
      onClose={() => {
        setConfirmStop(false);
        blocker.reset?.();
      }}
      title="Stop the import?"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setConfirmStop(false);
              blocker.reset?.();
            }}
          >
            Keep importing
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              abort.current?.abort();
              setConfirmStop(false);
              blocker.proceed?.();
            }}
          >
            Stop import
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">Everything added so far will be removed.</p>
    </Dialog>
  );

  if (step === "importing" && progress) {
    return (
      <>
        <PageHeader description="Your decks are on their way into Armin." />
        <ImportingStep
          progress={progress}
          fileName={source.fileName}
          deckCount={plan.decks.length}
          onCancel={() => setConfirmStop(true)}
        />
        {stopDialog}
      </>
    );
  }

  if (step === "done" && summary) {
    return (
      <>
        <PageHeader description="Your cards are ready to study." />
        <DoneStep
          summary={summary}
          skippedNotes={skippedNotes}
          fileName={source.fileName}
          onImportAnother={onChooseAnother}
        />
      </>
    );
  }

  if (step === "failed") {
    return (
      <>
        <PageHeader description="Something went wrong." />
        <div data-narrow className="space-y-6">
          <div
            role="alert"
            className="flex gap-3 border border-border bg-surface-sunken p-4 text-sm"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-again" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium text-ink">The import didn&apos;t finish.</p>
              <p className="text-muted">{failure}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setStep("preview")}>
            Back to preview
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader description="Pick the decks to bring over." />
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
        problems={problems}
        otherImport={running.data ?? null}
        cancellingOther={cancelOther.isPending}
        onCancelOther={() => running.data && cancelOther.mutate(running.data.id)}
        actions={
          <Button
            className="w-full"
            disabled={!canImport}
            busy={planStale}
            onClick={() => void start()}
          >
            Import
          </Button>
        }
        onChooseAnother={onChooseAnother}
      />
    </>
  );
}

/** The parent path every deck name shares, such as "French › ", so rows show only what differs. */
function sharedDeckPrefix(names: string[]) {
  if (names.length < 2) return "";
  const paths = names.map((name) => name.split(" › "));
  let depth = 0;
  while (paths.every((path) => depth < path.length - 1 && path[depth] === paths[0][depth])) depth++;
  return depth ? paths[0].slice(0, depth).join(" › ") + " › " : "";
}

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
  problems,
  otherImport,
  cancellingOther,
  onCancelOther,
  actions,
  onChooseAnother,
}: {
  source: OpenedAnkiFile;
  plan: ImportPlan;
  stale: boolean;
  selected: ReadonlySet<string>;
  names: Map<string, string>;
  mode: ProgressMode;
  onMode: (mode: ProgressMode) => void;
  onToggle: (key: string, checked: boolean) => void;
  onSelectAll: (all: boolean) => void;
  problems: string[];
  otherImport: { fileName: string } | null;
  cancellingOther: boolean;
  onCancelOther: () => void;
  actions: React.ReactNode;
  onChooseAnother: () => void;
}) {
  const allSelected = selected.size === source.decks.length;
  const historyCount = source.initialPlan.totals.reviewLogs;
  const shared = sharedDeckPrefix(source.decks.map((deck) => names.get(deck.key) ?? deck.name));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <section aria-labelledby="anki-decks" className="space-y-2">
        <div className="flex items-center gap-3 text-[0.8125rem] text-muted">
          <h3 id="anki-decks" className="min-w-0 truncate font-sans font-normal">
            <span className="font-medium text-ink">{source.fileName}</span> ·{" "}
            {formatBytes(source.fileSize)}
          </h3>
          <button
            type="button"
            onClick={onChooseAnother}
            className="shrink-0 font-medium text-accent hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Change file
          </button>
        </div>
        <div className="border border-border">
          <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-bg-2 px-3 py-2 text-[0.8125rem] text-muted">
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && selected.size > 0}
              onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
            />
            <span className="flex-1">Select all</span>
            <span className="tabular-nums">
              {selected.size} of {source.decks.length}
            </span>
          </label>
          <ul className="divide-y divide-border">
            {source.decks.map((deck) => {
              const armName = names.get(deck.key) ?? deck.name;
              return (
                <li key={deck.key}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-sunken">
                    <Checkbox
                      checked={selected.has(deck.key)}
                      onCheckedChange={(checked) => onToggle(deck.key, Boolean(checked))}
                    />
                    <TruncatedLabel
                      label={armName.slice(shared.length) || armName}
                      tooltip={armName}
                      className="text-sm text-ink"
                    />
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {plural(deck.cardCount, "card")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        {plan.warnings.length > 0 && <ImportChanges warnings={plan.warnings} stale={stale} />}
      </section>

      <aside className="space-y-5 lg:sticky lg:top-0 lg:pt-7">
        <section
          aria-label="What will be imported"
          aria-live="polite"
          className={stale ? "opacity-60 transition-opacity" : "transition-opacity"}
        >
          {plan.decks.length === 0 ? (
            <p className="text-sm text-muted">Select at least one deck to import.</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-ink">
                {stale && (
                  <LoaderCircle
                    className="h-3.5 w-3.5 shrink-0 animate-spin text-muted"
                    aria-hidden
                  />
                )}
                <span>
                  <span className="font-medium">{plural(plan.totals.flashcards, "card")}</span>
                  {" in "}
                  {plural(plan.decks.length, "deck")}
                  {plan.totals.mediaFiles > 0 &&
                    `, with ${plural(plan.totals.mediaFiles, "image")}`}
                </span>
              </p>
            </>
          )}
        </section>

        {source.reader.collection.format !== "text" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[0.8125rem] font-medium text-ink">Review progress</legend>
            <RadioGroup value={mode} onValueChange={(value) => onMode(value as ProgressMode)}>
              <label
                htmlFor="anki-progress-keep"
                className="flex cursor-pointer items-center gap-3 border border-border px-3 py-2 hover:bg-surface-sunken has-data-checked:border-accent has-data-checked:bg-accent-tint"
              >
                <RadioGroupItem id="anki-progress-keep" value="keep" />
                <span className="text-sm text-ink">
                  Keep from Anki
                  {historyCount > 0 && (
                    <span className="text-muted"> · {plural(historyCount, "review")}</span>
                  )}
                </span>
              </label>
              <label
                htmlFor="anki-progress-fresh"
                className="flex cursor-pointer items-center gap-3 border border-border px-3 py-2 hover:bg-surface-sunken has-data-checked:border-accent has-data-checked:bg-accent-tint"
              >
                <RadioGroupItem id="anki-progress-fresh" value="fresh" />
                <span className="text-sm text-ink">Start every card as new</span>
              </label>
            </RadioGroup>
          </fieldset>
        )}

        <section aria-label="Library limits" className="space-y-2 empty:hidden">
          {problems.length > 0 && (
            <div
              role="alert"
              className="border border-border bg-surface-sunken p-3 text-[0.8125rem]"
            >
              <p className="flex items-center gap-2 font-medium text-ink">
                <TriangleAlert className="h-4 w-4 shrink-0 text-again" aria-hidden />
                Too large to import
              </p>
              <ul className="mt-1.5 space-y-0.5 text-muted">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-muted">
                {source.decks.length > 1
                  ? "Deselect some decks to fit."
                  : "Split this deck in Anki and import the parts one at a time."}
              </p>
            </div>
          )}
          {otherImport && (
            <div
              role="alert"
              className="border border-border bg-surface-sunken p-3 text-[0.8125rem]"
            >
              <p className="flex items-center gap-2 font-medium text-ink">
                <LoaderCircle className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                Another import is running
              </p>
              <TruncatedLabel label={otherImport.fileName} className="mt-1.5 text-muted" />
              <p className="mt-1.5 text-muted">
                Wait for it to finish, or cancel it to start this one.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                busy={cancellingOther}
                onClick={onCancelOther}
              >
                Cancel the other import
              </Button>
            </div>
          )}
        </section>
        {actions}
      </aside>
    </div>
  );
}

/** Short labels read after the count of notes; other codes keep the converter's sentence. */
const CHANGE_LABELS: Partial<Record<ImportWarningCode, string>> = {
  custom_notetype_rendered: "became basic cards from custom note types",
  scripts_removed: "had scripts and styles removed",
  empty_note_skipped: "skipped for empty or unusable content",
  audio_removed: "had audio removed",
  video_removed: "had video removed",
  missing_media: "had missing images removed",
  unsupported_image_removed: "had unsupported images removed, such as SVG",
  content_truncated: "shortened to fit size limits",
  tags_trimmed: "had tags trimmed",
};

function ImportChanges({ warnings, stale }: { warnings: ImportWarning[]; stale: boolean }) {
  return (
    <details
      className={`details-reveal group mt-4 text-[0.8125rem] transition-opacity ${stale ? "opacity-60" : ""}`}
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-90"
          aria-hidden
        />
        {plural(warnings.length, "change")} on the way in
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border border-border bg-bg-2 px-3 py-2.5">
        {warnings.map((warning) => (
          <div key={warning.code} className="contents">
            <dt className="text-right font-medium text-ink tabular-nums">{n(warning.count)}</dt>
            <dd className="text-muted">{CHANGE_LABELS[warning.code] ?? warning.message}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function ImportingStep({
  progress,
  fileName,
  deckCount,
  onCancel,
}: {
  progress: ImportProgress;
  fileName: string;
  deckCount: number;
  onCancel: () => void;
}) {
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
  const done = visible.reduce((sum, phase) => sum + phase.counter.done, 0);
  const total = visible.reduce((sum, phase) => sum + phase.counter.total, 0);
  const percent =
    progress.stage === "finishing" ? 100 : total > 0 ? Math.floor((done / total) * 100) : 0;

  return (
    <section
      aria-labelledby="anki-importing"
      data-narrow
      className="border border-border bg-surface shadow-overlay"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {progress.stage === "finishing" ? "Finishing up" : active?.label}
      </p>
      <div className="flex items-end justify-between gap-6 px-6 pt-6">
        <div className="min-w-0">
          <h2
            id="anki-importing"
            className="font-serif text-[1.375rem] font-semibold tracking-tight text-ink"
          >
            {progress.stage === "finishing"
              ? "Finishing up"
              : `Importing ${plural(deckCount, "deck")}`}
          </h2>
          <p className="mt-1 truncate text-[0.8125rem] text-muted">{fileName}</p>
        </div>
        <p className="shrink-0 font-serif text-[2.5rem] leading-none font-semibold text-ink tabular-nums">
          {percent}
          <span className="ml-0.5 text-xl text-muted">%</span>
        </p>
      </div>
      <Progress
        value={percent}
        max={100}
        label="Import progress"
        className="mx-6 mt-5 h-2 w-auto"
      />

      <ol className="mt-6 border-t border-border">
        {visible.map((phase) => {
          const index = order.indexOf(phase.stage);
          const state = index < current ? "done" : index === current ? "active" : "waiting";
          return (
            <li
              key={phase.stage}
              className={`flex items-center gap-3 border-b border-border px-6 py-3.5 text-sm ${
                state === "active" ? "bg-accent-tint/40" : ""
              }`}
            >
              <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <Check className="h-4 w-4 text-good" />
                ) : state === "active" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <span className="h-1.5 w-1.5 bg-border-strong" />
                )}
              </span>
              <span className={state === "waiting" ? "text-muted" : "font-medium text-ink"}>
                {phase.label}
              </span>
              <span className="ml-auto text-[0.8125rem] text-muted tabular-nums">
                {state === "done"
                  ? n(phase.counter.total)
                  : `${n(phase.counter.done)} of ${n(phase.counter.total)}`}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <p className="text-[0.8125rem] text-muted">Keep this tab open until it finishes.</p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel import
        </Button>
      </div>
    </section>
  );
}

function DoneStep({
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
      `${plural(summary.skippedImages, "image")} left out (unsupported, too large, or missing)`,
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
