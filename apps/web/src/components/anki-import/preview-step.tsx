import { Link } from "@tanstack/react-router";
import { ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { type ImportPlan, type ImportWarning, type ImportWarningCode } from "@armin/core/anki";
import { MAX_FLASHCARDS_PER_DECK, MAX_REVIEW_UNITS_PER_DECK } from "@armin/core/plans";
import { isAudioFile } from "@armin/core/media";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import { type OpenedAnkiFile } from "@/lib/anki/opened-file";
import { n, plural, formatBytes, type ProgressMode } from "./format";
import { NotImported } from "./not-imported";

export type ImportProblem = { kind: "decks" | "room"; message: string };

export type FirstNAction = {
  room: { flashcards: number; reviewUnits: number };
  deckLabel: string;
};

function sharedDeckPrefix(names: string[]) {
  if (names.length < 2) return "";
  const paths = names.map((name) => name.split(" › "));
  let depth = 0;
  while (paths.every((path) => depth < path.length - 1 && path[depth] === paths[0][depth])) depth++;
  return depth ? paths[0].slice(0, depth).join(" › ") + " › " : "";
}

export function PreviewStep({
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
  firstNAction,
  showUpgrade,
  onLimit,
  onImportAll,
  notetypeSection,
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
  problems: ImportProblem[];
  firstNAction: FirstNAction | null;
  showUpgrade: boolean;
  onLimit: () => void;
  onImportAll: () => void;
  notetypeSection: React.ReactNode;
  otherImport: { fileName: string } | null;
  cancellingOther: boolean;
  onCancelOther: () => void;
  actions: React.ReactNode;
  onChooseAnother: () => void;
}) {
  const allSelected = selected.size === source.decks.length;
  const historyCount =
    source.initialPlan.totals.reviewLogs + (source.initialPlan.reviewLogsDropped ?? 0);
  const shared = sharedDeckPrefix(source.decks.map((deck) => names.get(deck.key) ?? deck.name));
  const media = new Set(plan.flashcards.flatMap((card) => card.media));
  const audioFiles = [...media].filter((name) => isAudioFile(name)).length;
  const imageFiles = media.size - audioFiles;
  const mediaParts = [
    imageFiles > 0 && plural(imageFiles, "image"),
    audioFiles > 0 && plural(audioFiles, "audio file"),
  ].filter(Boolean);
  const presets = new Set(
    plan.decks.flatMap((deck) =>
      deck.settings && deck.ankiLimits ? [deck.ankiLimits.preset] : [],
    ),
  );
  const decksWithSettings = plan.decks.filter((deck) => deck.settings).length;
  const limits = plan.decks.find((deck) => deck.ankiLimits)?.ankiLimits;
  const deckCountProblem = problems.some((problem) => problem.kind === "decks");
  const unitBound =
    firstNAction !== null &&
    firstNAction.room.flashcards >= plan.totals.flashcards &&
    plan.totals.reviewUnits > firstNAction.room.reviewUnits;
  const splitDecks = [
    ...new Map(
      plan.decks.filter((deck) => deck.split).map((deck) => [deck.split!.key, deck]),
    ).values(),
  ];
  const changes = plan.omitted?.length
    ? plan.warnings.filter((warning) => warning.code !== "empty_note_skipped")
    : plan.warnings;

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
        {changes.length > 0 && <ImportChanges warnings={changes} stale={stale} />}
        {plan.omitted?.length ? <NotImported omitted={plan.omitted} stale={stale} /> : null}
        {notetypeSection}
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
                  {mediaParts.length > 0 && `, with ${mediaParts.join(" and ")}`}
                </span>
              </p>
            </>
          )}
        </section>

        {plan.limit && plan.limit.leftOut > 0 && (
          <section
            aria-label="Import limit"
            className="space-y-1.5 border border-border bg-bg-2 p-3 text-[0.8125rem]"
          >
            <p className="font-medium text-ink">
              Importing the first {n(plan.totals.flashcards)} of{" "}
              {n(plan.totals.flashcards + plan.limit.leftOut)} cards
            </p>
            <p className="text-muted">Your plan's remaining room sets the limit.</p>
            <button
              type="button"
              onClick={onImportAll}
              className="font-medium text-accent hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Import all
            </button>
          </section>
        )}

        {splitDecks.length > 0 && (
          <section aria-label="Deck splitting" className="space-y-1.5 text-[0.8125rem] text-muted">
            {splitDecks.map((deck) => {
              const split = deck.split!;
              const cap =
                split.cap === "flashcards"
                  ? `${n(MAX_FLASHCARDS_PER_DECK)} cards`
                  : `${n(MAX_REVIEW_UNITS_PER_DECK)} review items`;
              return (
                <p key={split.key}>
                  <span className="font-medium text-ink">{deck.ankiName}</span> has{" "}
                  {plural(split.cards, "card")}. It will be imported as{" "}
                  {plural(split.parts, "deck")}, because a deck holds up to {cap}.
                </p>
              );
            })}
          </section>
        )}

        {(plan.reviewLogsDropped ?? 0) > 0 && (
          <p className="text-xs text-muted">
            {plural(plan.reviewLogsDropped!, "older review")} won&apos;t come along. Every card
            keeps its schedule.
          </p>
        )}

        {(decksWithSettings > 0 || limits) && plan.decks.length > 0 && (
          <section aria-label="Deck options" className="space-y-1.5 text-[0.8125rem] text-muted">
            {decksWithSettings > 0 && (
              <p>
                <span className="font-medium text-ink">Deck options carry over</span> for{" "}
                {plural(decksWithSettings, "deck")}
                {presets.size > 0 && ` (${[...presets].join(", ")})`}: desired retention, learning
                steps, maximum interval, and FSRS parameters.
              </p>
            )}
            {limits && (
              <p>
                Anki&apos;s daily limits
                {limits.newPerDay !== null && ` (${n(limits.newPerDay)} new`}
                {limits.reviewsPerDay !== null &&
                  `${limits.newPerDay !== null ? ", " : " ("}${n(limits.reviewsPerDay)} reviews`}
                {(limits.newPerDay !== null || limits.reviewsPerDay !== null) && " a day)"} stay
                behind. Armin uses one daily limit for your whole library, set in{" "}
                <Link to="/settings" className="text-accent hover:text-accent-deep">
                  Settings
                </Link>
                .
              </p>
            )}
          </section>
        )}

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
          {firstNAction ? (
            <div className="border border-border bg-surface-sunken p-3 text-[0.8125rem]">
              <p className="text-muted">
                <span className="font-medium text-ink">{firstNAction.deckLabel}</span> has{" "}
                {plural(plan.totals.flashcards, "card")}
                {unitBound ? (
                  <>
                    , needing {plural(plan.totals.reviewUnits, "review item")}. Your plan has room
                    for {n(firstNAction.room.reviewUnits)}.
                  </>
                ) : (
                  <>. Your plan has room for {n(firstNAction.room.flashcards)}.</>
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button size="sm" onClick={onLimit}>
                  {unitBound
                    ? "Import the first cards that fit"
                    : `Import the first ${n(firstNAction.room.flashcards)} cards`}
                </Button>
                {showUpgrade && (
                  <Link
                    to="/settings"
                    search={{ tab: "billing" }}
                    className="font-medium text-accent hover:text-accent-deep"
                  >
                    Upgrade to import all
                  </Link>
                )}
              </div>
            </div>
          ) : (
            problems.length > 0 && (
              <div
                role="alert"
                className="border border-border bg-surface-sunken p-3 text-[0.8125rem]"
              >
                <p className="flex items-center gap-2 font-medium text-ink">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-again" aria-hidden />
                  Doesn&apos;t fit your library
                </p>
                <ul className="mt-1.5 space-y-0.5 text-muted">
                  {problems.map((problem) => (
                    <li key={`${problem.kind}:${problem.message}`}>{problem.message}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-muted">
                  {deckCountProblem || selected.size > 1 ? (
                    "Deselect some decks to fit."
                  ) : showUpgrade ? (
                    <>
                      Delete some cards to make room, or{" "}
                      <Link
                        to="/settings"
                        search={{ tab: "billing" }}
                        className="font-medium text-accent hover:text-accent-deep"
                      >
                        upgrade to Pro
                      </Link>
                      .
                    </>
                  ) : (
                    "Delete some cards to make room."
                  )}
                </p>
              </div>
            )
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

const CHANGE_LABELS: Record<ImportWarningCode, string> = {
  custom_notetype_rendered: "were rendered from custom note type templates",
  scripts_removed: "had scripts and styles removed",
  empty_note_skipped: "skipped for empty or unusable content",
  audio_removed: "had audio in an unsupported format removed",
  tts_removed: "had text-to-speech left out",
  video_removed: "had video removed",
  missing_media: "had missing images or audio removed",
  unsupported_image_removed: "had unsupported images removed",
  flags_as_tags: "had flags turned into tags, such as flag::red",
  content_truncated: "shortened to fit size limits",
  tags_trimmed: "had tags shortened or capped",
  occlusion_shape_approximated: "had round or slanted occlusion shapes drawn as rectangles",
  occlusion_labels_removed: "had text labels on their occlusion image left out",
  additional_fields_added: "had extra cloze fields added to the answer",
  additional_fields_omitted: "had extra cloze fields left out",
  nested_cloze_flattened: "had nested clozes split into separate ones",
  shared_cloze_narrowed: "had clozes shared by several cards kept on the first card only",
  audio_only_card_skipped: "had cards that only play audio skipped",
  required_content_card_skipped: "had cards skipped for front content that couldn't be imported",
  math_unsupported: "kept equations with unsupported syntax as source",
  math_as_text: "kept legacy [latex] content as source",
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
            <dd className="text-muted">{CHANGE_LABELS[warning.code]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
