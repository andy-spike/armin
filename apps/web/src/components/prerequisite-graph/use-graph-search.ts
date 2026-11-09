import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import type { UiDeckGraph } from "@/types/view-models";

const REVEAL_DELAY_MS = 300;

export function useGraphSearch(nodes: UiDeckGraph["nodes"], interactive: boolean) {
  const { fitView } = useReactFlow();
  const [search, setSearch] = useState("");
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
  const matches = useMemo(() => (query === "" ? null : new Set(matchIds)), [matchIds, query]);

  const [stepQuery, setStepQuery] = useState(query);
  if (query !== stepQuery) {
    setStepQuery(query);
    setStep(null);
  } else if (step !== null) {
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

function searchStatus(search: string, matchCount: number, step: number | null) {
  if (search.trim() === "") return null;
  if (matchCount === 0) return `No cards match “${search.trim()}”.`;
  if (step !== null) {
    return `${Math.min(step + 1, matchCount)} of ${matchCount} · Enter for next, Shift+Enter for previous`;
  }
  const noun = matchCount === 1 ? "match" : "matches";
  return `${matchCount} ${noun} · Enter to step through`;
}
