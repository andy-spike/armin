import {
  generateReviewUnits,
  parseStoredContent,
} from "@armin/core/flashcard-types";
import {
  mediaFileNamesIn,
  type RecordData,
  type RecordKind,
  type RejectionCode,
} from "@armin/sync-contract";

/**
 * The state a write would produce, read lazily. `getMany` and `childrenMany`
 * return live records only.
 */
export interface StateView {
  getMany<K extends RecordKind>(
    kind: K,
    ids: string[],
  ): Promise<Map<string, RecordData[K]>>;
  childrenMany<K extends RecordKind>(
    kind: K,
    parentIds: string[],
  ): Promise<Map<string, { id: string; data: RecordData[K] }[]>>;
  missingMedia(fileNames: string[]): Promise<string[]>;
}

/** Records whose relationships must be re-checked after a write. */
export type Touched = {
  decks: Set<string>;
  flashcards: Set<string>;
  /** Deck ids whose prerequisite graph must still be valid. */
  graphs: Set<string>;
  deckSettings: Set<string>;
  reviewLogs: Set<string>;
};

export const emptyTouched = (): Touched => ({
  decks: new Set(),
  flashcards: new Set(),
  graphs: new Set(),
  deckSettings: new Set(),
  reviewLogs: new Set(),
});

export type IntegrityProblem = {
  code: Extract<RejectionCode, "integrity" | "missing_media">;
  message: string;
};

const problem = (message: string): IntegrityProblem => ({
  code: "integrity",
  message,
});

/**
 * The first relationship rule the touched records break, or null. Rules:
 * - a Flashcard belongs to a live Deck, and its live Review units match the
 *   sub-keys its content generates, one each;
 * - a deleted Deck leaves no Flashcards, graph, or Deck settings behind;
 * - a Deck's graph only refers to that Deck's live Flashcards and is acyclic;
 * - review logs belong to live Review units;
 * - media referenced by Flashcard content has been uploaded.
 */
export async function findIntegrityProblem(
  view: StateView,
  touched: Touched,
): Promise<IntegrityProblem | null> {
  const deckIds = new Set(touched.decks);
  const flashcardIds = [...touched.flashcards];
  const flashcards = await view.getMany("flashcard", flashcardIds);
  for (const card of flashcards.values()) deckIds.add(card.deckId);

  const graphDeckIds = [...touched.graphs];
  const settingsDeckIds = [...touched.deckSettings];
  const [graphs, deckSettings] = await Promise.all([
    view.getMany("deck_graph", [
      ...new Set([...graphDeckIds, ...touched.decks]),
    ]),
    view.getMany("deck_settings", [
      ...new Set([...settingsDeckIds, ...touched.decks]),
    ]),
  ]);
  for (const id of graphs.keys()) deckIds.add(id);
  for (const id of deckSettings.keys()) deckIds.add(id);
  const decks = await view.getMany("deck", [...deckIds]);

  for (const deckId of touched.decks) {
    if (decks.has(deckId)) continue;
    const cards = (await view.childrenMany("flashcard", [deckId])).get(deckId);
    if (cards?.length) {
      return problem(`Deleted Deck ${deckId} still has Flashcards.`);
    }
    if (graphs.has(deckId) || deckSettings.has(deckId)) {
      return problem(
        `Deleted Deck ${deckId} still has a graph or Deck settings.`,
      );
    }
  }

  const units = await view.childrenMany("review_unit", flashcardIds);
  const media = new Set<string>();
  for (const id of flashcardIds) {
    const card = flashcards.get(id);
    const subKeys = (units.get(id) ?? []).map((unit) => unit.data.subKey);
    if (!card) {
      if (subKeys.length > 0) {
        return problem(`Deleted Flashcard ${id} still has Review units.`);
      }
      continue;
    }
    if (!decks.has(card.deckId)) {
      return problem(`Flashcard ${id} belongs to missing Deck ${card.deckId}.`);
    }
    const { type, content } = parseStoredContent(card.type, card.content);
    const expected = generateReviewUnits(type, content).map((s) => s.subKey);
    if (!sameKeys(subKeys, expected)) {
      return problem(
        `Flashcard ${id} needs exactly one Review unit for each of [${expected.join(", ")}]; it has [${subKeys.join(", ")}].`,
      );
    }
    for (const name of mediaFileNamesIn(card.content)) media.add(name);
  }

  for (const deckId of graphDeckIds) {
    const graph = graphs.get(deckId);
    if (!graph) continue;
    if (!decks.has(deckId)) {
      return problem(`Graph for missing Deck ${deckId}.`);
    }
    const graphProblem = await findGraphProblem(view, deckId, graph);
    if (graphProblem) return graphProblem;
  }

  for (const deckId of settingsDeckIds) {
    if (deckSettings.has(deckId) && !decks.has(deckId)) {
      return problem(`Deck settings for missing Deck ${deckId}.`);
    }
  }

  const logs = await view.getMany("review_log", [...touched.reviewLogs]);
  const logUnits = await view.getMany(
    "review_unit",
    [...logs.values()].map((log) => log.reviewUnitId),
  );
  for (const [id, log] of logs) {
    if (!logUnits.has(log.reviewUnitId)) {
      return problem(
        `Review log ${id} belongs to missing Review unit ${log.reviewUnitId}.`,
      );
    }
  }

  const missing = await view.missingMedia([...media]);
  if (missing.length > 0) {
    return {
      code: "missing_media",
      message: `Upload media before referencing it: ${missing.join(", ")}.`,
    };
  }
  return null;
}

async function findGraphProblem(
  view: StateView,
  deckId: string,
  graph: RecordData["deck_graph"],
) {
  const nodeIds = new Set(Object.keys(graph.positions));
  const edgeKeys = new Set<string>();
  const dependents = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const { prereqId, dependentId } of graph.edges) {
    if (prereqId === dependentId) {
      return problem(`Flashcard ${prereqId} cannot be its own prerequisite.`);
    }
    const key = `${prereqId}\u0000${dependentId}`;
    if (edgeKeys.has(key)) {
      return problem(`Duplicate prerequisite ${prereqId} → ${dependentId}.`);
    }
    edgeKeys.add(key);
    nodeIds.add(prereqId);
    nodeIds.add(dependentId);
    dependents.set(prereqId, [
      ...(dependents.get(prereqId) ?? []),
      dependentId,
    ]);
    inDegree.set(dependentId, (inDegree.get(dependentId) ?? 0) + 1);
  }

  const cards = await view.getMany("flashcard", [...nodeIds]);
  for (const id of nodeIds) {
    if (cards.get(id)?.deckId !== deckId) {
      return problem(
        `Graph for Deck ${deckId} refers to Flashcard ${id}, which is not a live Flashcard in that Deck.`,
      );
    }
  }

  const ready = [...nodeIds].filter((id) => !inDegree.get(id));
  let visited = 0;
  while (ready.length > 0) {
    const id = ready.pop()!;
    visited++;
    for (const next of dependents.get(id) ?? []) {
      const remaining = inDegree.get(next)! - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }
  if (visited !== nodeIds.size) {
    return problem(`Graph for Deck ${deckId} contains a prerequisite cycle.`);
  }
  return null;
}

function sameKeys(actual: string[], expected: string[]) {
  if (actual.length !== expected.length) return false;
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.every((key, i) => key === sortedExpected[i]);
}
