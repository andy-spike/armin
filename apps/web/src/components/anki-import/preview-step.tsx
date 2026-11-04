import { Link } from "@tanstack/react-router";
import { ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { type ImportPlan, type ImportWarning, type ImportWarningCode } from "@armin/core/anki";
import { isAudioFile } from "@armin/core/media";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import { type OpenedAnkiFile } from "@/lib/anki/opened-file";
import { n, plural, formatBytes, type ProgressMode } from "./format";

/** The parent path every deck name shares, such as "French › ", so rows show only what differs. */
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
  problems: string[];
  notetypeSection: React.ReactNode;
  otherImport: { fileName: string } | null;
  cancellingOther: boolean;
  onCancelOther: () => void;
  actions: React.ReactNode;
  onChooseAnother: () => void;
}) {
  const allSelected = selected.size === source.decks.length;
  const historyCount = source.initialPlan.totals.reviewLogs;
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
  audio_removed: "had audio in an unsupported format removed",
  tts_removed: "had text-to-speech left out",
  video_removed: "had video removed",
  missing_media: "had missing images or audio removed",
  unsupported_image_removed: "had unsupported images removed",
  flags_as_tags: "had flags turned into tags, such as flag::red",
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
