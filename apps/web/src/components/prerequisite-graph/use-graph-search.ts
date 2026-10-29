import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import type { UiDeckGraph } from "@/types/view-models";

// The query must settle this long before the canvas pans to the matches, so
// typing doesn't move the view on every keystroke.
const REVEAL_DELAY_MS = 300;

/**
 * Card search on the graph canvas. Matching cards stay bright and the rest
 * dim (see the emphasis effect in the canvas). Once the query settles, the
 * view frames every match; Enter and Shift+Enter then step through them one
 * at a time.
 */
export function useGraphSearch(nodes: UiDeckGraph["nodes"], interactive: boolean) {
  const { fitView } = useReactFlow();
  const [search, setSearch] = useState("");
  // The match Enter/Shift+Enter last moved to, or null while every match is
  // framed together.
  const [step, setStep] = useState<number | null>(null);
  const lastRevealedQuery = useRef("");

  const query = search.trim().toLowerCase();
  const matchIds = useMemo(
    () =>
      query === ""
        ? []
        : nodes
            .filter((node) => `${node.front} ${node.back}`.toLowerCase().includes(query))
            .map((node) => node.id),
    [nodes, query],
  );
  // Null while not searching, so callers can tell "no query" from "no matches".
  const matches = useMemo(() => (query === "" ? null : new Set(matchIds)), [matchIds, query]);

  // A new query starts back at the overview of all matches.
  const [stepQuery, setStepQuery] = useState(query);
  if (query !== stepQuery) {
    setStepQuery(query);
    setStep(null);
  } else if (step !== null) {
    // Keep the position valid when an edit removes matches.
    const validStep = matchIds.length === 0 ? null : Math.min(step, matchIds.length - 1);
    if (validStep !== step) setStep(validStep);
  }
  const currentMatchId = step === null ? null : (matchIds[step] ?? null);

  useEffect(() => {
    if (query === "") {
      lastRevealedQuery.current = "";
      return;
    }
    if (!interactive || query === lastRevealedQuery.current) return;
    if (matchIds.length === 0) return;
    const timer = window.setTimeout(() => {
      lastRevealedQuery.current = query;
      void fitView({
        nodes: matchIds.map((id) => ({ id })),
        padding: 0.3,
        maxZoom: 1,
        duration: 300,
      });
    }, REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [fitView, interactive, matchIds, query]);

  /** Center the next (1) or previous (-1) match, wrapping at the ends. */
  const stepThroughMatches = (direction: 1 | -1) => {
    if (matchIds.length === 0) return;
    let next: number;
    if (step === null) next = direction === 1 ? 0 : matchIds.length - 1;
    else next = (step + direction + matchIds.length) % matchIds.length;
    lastRevealedQuery.current = query;
    setStep(next);
    void fitView({
      nodes: [{ id: matchIds[next] }],
      padding: 0.4,
      maxZoom: 1,
      duration: 300,
    });
  };

  return {
    search,
    setSearch,
    query,
    matches,
    currentMatchId,
    hasMatches: matchIds.length > 0,
    stepping: step !== null,
    stepThroughMatches,
    status: searchStatus(search, matchIds.length, step),
  };
}

/** The line shown under the search box, or null while not searching. */
function searchStatus(search: string, matchCount: number, step: number | null) {
  if (search.trim() === "") return null;
  if (matchCount === 0) return `No cards match “${search.trim()}”.`;
  if (step !== null) {
    return `${Math.min(step + 1, matchCount)} of ${matchCount} · Enter for next, Shift+Enter for previous`;
  }
  const noun = matchCount === 1 ? "match" : "matches";
  return `${matchCount} ${noun} · Enter to step through`;
}
