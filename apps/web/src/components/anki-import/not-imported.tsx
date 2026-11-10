import { ChevronRight } from "lucide-react";
import type { ImportOmitted, ImportOmittedReason } from "@armin/core/anki";
import { plural } from "./format";

/** Why notes were left out, read after "3 notes of type “X”:". */
const REASONS: Record<ImportOmittedReason, string> = {
  missing_notetype: "their note type is missing from the file.",
  empty_content: "they have no content Armin can use.",
  missing_image: "the image they need is missing from the file.",
  unsupported_image: "the image they need is in a format Armin can't store.",
  audio_only: "their cards only play audio.",
  unusable_template: "their card templates produce no usable card.",
  unreadable_masks: "their occlusion masks are missing from the file or can't be read.",
  unsupported_occlusion: "this occlusion format isn't supported yet.",
};

/** The notes that won't become cards, grouped by note type and reason. */
export function NotImported({ omitted, stale }: { omitted: ImportOmitted[]; stale: boolean }) {
  const groups = new Map<string, { name: string; reason: ImportOmittedReason; notes: number }>();
  for (const note of omitted) {
    const key = `${note.notetypeId}:${note.reason}`;
    const group = groups.get(key) ?? { name: note.notetypeName, reason: note.reason, notes: 0 };
    group.notes++;
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort((a, b) => b.notes - a.notes);
  return (
    <details
      className={`details-reveal group mt-3 text-[0.8125rem] transition-opacity ${stale ? "opacity-60" : ""}`}
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-90"
          aria-hidden
        />
        {plural(omitted.length, "note")} not imported
      </summary>
      <ul className="mt-2 space-y-1.5 border border-border bg-bg-2 px-3 py-2.5 text-muted">
        {rows.map((row) => (
          <li key={`${row.name}:${row.reason}`}>
            <span className="font-medium text-ink">
              {plural(row.notes, "note")}
              {row.name ? ` of type “${row.name}”` : ""}
            </span>
            : {REASONS[row.reason]}
          </li>
        ))}
      </ul>
    </details>
  );
}
