import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { linkProblem, type GraphCycleIndex } from "@/lib/graph-cycle";
import { graphNodePreview } from "@/lib/graph-flow";
import type { UiDeckGraph } from "@/types/view-models";

export type GraphLinkOption = { id: string; label: string };

/** Which picker is open, and for which card. */
export type LinkPickerRequest = {
  kind: "add-prereq" | "add-dependent" | "remove-prereq";
  nodeId: string;
};

/** The link a picked card stands for. */
export type PickedLink = {
  action: "add" | "remove";
  prereqId: string;
  dependentId: string;
};

/**
 * The picker's text and choices for a request. Add pickers only list cards
 * that `linkProblem` allows; the remove picker lists the card's current
 * prerequisites. Returns null when the card no longer exists.
 */
export function linkPickerContent(
  request: LinkPickerRequest,
  graph: UiDeckGraph,
  graphIndex: GraphCycleIndex,
) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const node = nodeById.get(request.nodeId);
  if (!node) return null;
  const front = graphNodePreview(node.front);

  const optionsFor = (ids: string[]): GraphLinkOption[] =>
    ids
      .flatMap((id) => {
        const card = nodeById.get(id);
        return card ? [{ id, label: graphNodePreview(card.front) }] : [];
      })
      .sort((a, b) => a.label.localeCompare(b.label));

  if (request.kind === "remove-prereq") {
    const prereqIds = graph.edges
      .filter((edge) => edge.dependentId === request.nodeId)
      .map((edge) => edge.prereqId);
    return {
      title: "Remove prerequisite",
      description: `Choose the prerequisite link to “${front}” that should be removed.`,
      options: optionsFor(prereqIds),
      emptyText: "This card has no prerequisites.",
      linkFor: (id: string): PickedLink => ({
        action: "remove",
        prereqId: id,
        dependentId: request.nodeId,
      }),
    };
  }

  // The picked card is the prerequisite when adding a prerequisite, and the
  // dependent when adding a dependent.
  const linkFor = (id: string): PickedLink =>
    request.kind === "add-prereq"
      ? { action: "add", prereqId: id, dependentId: request.nodeId }
      : { action: "add", prereqId: request.nodeId, dependentId: id };
  const allowedIds = graph.nodes
    .map((candidate) => candidate.id)
    .filter((id) => {
      const { prereqId, dependentId } = linkFor(id);
      return linkProblem(graphIndex, prereqId, dependentId) === null;
    });

  if (request.kind === "add-prereq") {
    return {
      title: "Add prerequisite",
      description: `Choose a card that “${front}” should depend on.`,
      options: optionsFor(allowedIds),
      emptyText: "No card can be added as a prerequisite.",
      linkFor,
    };
  }
  return {
    title: "Add dependent",
    description: `Choose a card that should depend on “${front}”.`,
    options: optionsFor(allowedIds),
    emptyText: "No card can be added as a dependent.",
    linkFor,
  };
}

const MAX_RESULTS = 100;

/**
 * Searchable card picker used by the graph's keyboard path to add or remove a
 * prerequisite link without dragging on the canvas. Options are validated by
 * the caller (no self-loops, duplicates, or cycles).
 */
export function GraphLinkPicker({
  open,
  title,
  description,
  options,
  emptyText,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  options: GraphLinkOption[];
  emptyText: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  const shown = filtered.slice(0, MAX_RESULTS);

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <label className="flex h-9 items-center gap-2 border border-border-strong bg-surface px-2.5 focus-within:ring-2 focus-within:ring-accent">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Search cards</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cards…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
      </label>
      {shown.length > 0 ? (
        <ul className="mt-3 max-h-64 overflow-y-auto border border-border">
          {shown.map((option) => (
            <li key={option.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(option.id)}
                className="w-full cursor-pointer px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <span className="line-clamp-2 whitespace-pre-wrap break-words">{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border border-dashed border-border-strong bg-bg-2 px-4 py-6 text-center text-sm text-muted">
          {query.trim() ? "No cards match that search." : emptyText}
        </p>
      )}
      {filtered.length > shown.length && (
        <p className="mt-2 text-xs text-muted">
          Showing the first {MAX_RESULTS} of {filtered.length} matching cards.
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
