import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { TriangleAlert } from "lucide-react";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import {
  customNotetypes,
  type ImportPlan,
  type NotetypeMapping,
  uniqueDeckNames,
} from "@armin/core/anki";
import { mappingComplete, NotetypeMappingSection } from "@/components/anki-notetype-mapping";
import { AnkiFilePicker } from "@/components/anki-file-picker";
import { useBillingStatus } from "@/components/billing-settings";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { convexClient, errorMessage } from "@/lib/armin-client";
import { getOpenedAnkiFile, setOpenedAnkiFile, type OpenedAnkiFile } from "@/lib/anki/opened-file";
import {
  ImportCancelledError,
  importErrorMessage,
  runImport,
  type ImportProgress,
  type ImportSummary,
} from "@/lib/anki/import-runner";
import { n, plural, type ProgressMode } from "./format";
import { PreviewStep, type ImportProblem } from "./preview-step";
import { ImportingStep } from "./importing-step";
import { DoneStep } from "./done-step";

type Step = "preview" | "importing" | "done" | "failed";

export function AnkiImportPage() {
  const [source, setSource] = useState<OpenedAnkiFile | null>(getOpenedAnkiFile);

  const open = (file: OpenedAnkiFile) => {
    setOpenedAnkiFile(file);
    setSource(file);
  };

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
  const [mappings, setMappings] = useState<Record<string, NotetypeMapping>>({});
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const previewing = step === "preview";

  const activeMappings = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(mappings).filter(
          ([, mapping]) => mapping.kind !== "template" && mappingComplete(mapping),
        ),
      ),
    [mappings],
  );
  const [limited, setLimited] = useState(false);
  const usage = useQuery({ ...convexQuery(api.imports.usage, {}), enabled: previewing });
  const running = useQuery({ ...convexQuery(api.imports.current, {}), enabled: previewing });
  const room = useMemo(() => {
    if (!usage.data) return null;
    const { limits } = usage.data;
    return {
      flashcards: Math.max(0, limits.flashcards - usage.data.flashcards),
      reviewUnits: Math.max(0, limits.reviewUnits - usage.data.reviewUnits),
    };
  }, [usage.data]);
  const limit = limited ? room : null;
  const limitKey = limit ? `${limit.flashcards}:${limit.reviewUnits}` : limited ? "waiting" : "";
  const planKey = `${mode}|${[...selected].sort().join(",")}|${limitKey}|${JSON.stringify(activeMappings)}`;
  const usesInitialPlan =
    !limited &&
    selected.size === source.decks.length &&
    mode === "keep" &&
    Object.keys(activeMappings).length === 0;
  const [converted, setConverted] = useState<{ key: string; plan: ImportPlan } | null>(null);
  const plan = usesInitialPlan ? source.initialPlan : (converted?.plan ?? source.initialPlan);
  const planStale = !usesInitialPlan && converted?.key !== planKey;
  useEffect(() => {
    if (usesInitialPlan || (limited && !limit)) return;
    let current = true;
    const timer = setTimeout(() => {
      source.reader
        .convert({
          progress: mode,
          deckIds: [...selected],
          now: source.openedAt,
          rasterizeSvg: true,
          notetypeMappings: activeMappings,
          ...(limit ? { limit } : {}),
        })
        .then(
          (next) => current && setConverted({ key: planKey, plan: next }),
          () => {},
        );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [source, usesInitialPlan, selected, mode, planKey, activeMappings, limited, limit]);

  const notetypes = useMemo(
    () => customNotetypes(source.reader.collection, [...selected]),
    [source, selected],
  );
  const mappingsReady = notetypes.every((notetype) => mappingComplete(mappings[notetype.id]));
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
    if (!usage.data || !room || (limited && !plan.limit)) return [];
    const { limits } = usage.data;
    const found: ImportProblem[] = [];
    const hasMultiUnit = plan.totals.reviewUnits > plan.totals.flashcards;
    if (usage.data.decks + plan.decks.length > limits.decks)
      found.push({
        kind: "decks",
        message: `${plural(plan.decks.length, "deck")}, room for ${n(Math.max(0, limits.decks - usage.data.decks))}`,
      });
    if (room.flashcards === 0 || room.reviewUnits === 0)
      found.push({ kind: "room", message: "Your library has no room left on your plan." });
    else if (plan.totals.flashcards > room.flashcards)
      found.push({
        kind: "room",
        message: `${plural(plan.totals.flashcards, "card")}, room for ${n(room.flashcards)}`,
      });
    if (room.flashcards > 0 && room.reviewUnits > 0 && plan.totals.reviewUnits > room.reviewUnits)
      found.push({
        kind: "room",
        message: `${plural(plan.totals.reviewUnits, "review item")}, room for ${n(room.reviewUnits)}${hasMultiUnit ? " (cloze and reversed cards count once per blank or side)" : ""}`,
      });
    if (plan.limit && plan.totals.flashcards === 0)
      found.push({
        kind: "room",
        message: `Not enough room for the first note (${plural(plan.limit.leftOut, "card")})`,
      });
    return found;
  }, [plan, usage.data, room, limited]);

  const billing = useBillingStatus();
  const names = useMemo(() => {
    const map = new Map<string, string>();
    const unique = uniqueDeckNames(plan.decks);
    plan.decks.forEach((deck, index) => map.set(deck.key, unique[index]));
    return map;
  }, [plan]);

  const selectedKey = selected.size === 1 ? [...selected][0] : null;
  const firstNAction =
    !limited &&
    problems.length > 0 &&
    problems.every((problem) => problem.kind === "room") &&
    room &&
    room.flashcards > 0 &&
    room.reviewUnits > 0
      ? {
          room,
          deckLabel:
            (selectedKey && source.decks.find((deck) => deck.key === selectedKey)?.name) ||
            source.fileName,
        }
      : null;

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

  const blocker = useBlocker({
    shouldBlockFn: () => step === "importing",
    enableBeforeUnload: () => step === "importing",
    withResolver: true,
  });

  const skippedNotes = plan.warnings.find((w) => w.code === "empty_note_skipped")?.count ?? 0;
  const blocked = problems.length > 0 || Boolean(running.data);
  const canImport =
    previewing && plan.decks.length > 0 && !planStale && usage.data && !blocked && mappingsReady;

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
        firstNAction={firstNAction}
        showUpgrade={Boolean(billing.data?.enabled && billing.data.plan === "free")}
        onLimit={() => setLimited(true)}
        onImportAll={() => setLimited(false)}
        notetypeSection={
          <NotetypeMappingSection
            notetypes={notetypes}
            mappings={mappings}
            onChange={(id, mapping) => setMappings((current) => ({ ...current, [id]: mapping }))}
          />
        }
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
