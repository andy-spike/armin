export type GraphEdge = {
  prereqId: string;
  dependentId: string;
};

export type GraphCycleIndex = {
  edgeKeys: Set<string>;
  adjacency: Map<string, string[]>;
};

export function graphEdgeKey(prereqId: string, dependentId: string) {
  return `${prereqId}->${dependentId}`;
}

export function createGraphCycleIndex(edges: GraphEdge[]): GraphCycleIndex {
  const edgeKeys = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    edgeKeys.add(graphEdgeKey(edge.prereqId, edge.dependentId));
    const list = adjacency.get(edge.prereqId);
    if (list) list.push(edge.dependentId);
    else adjacency.set(edge.prereqId, [edge.dependentId]);
  }

  return { edgeKeys, adjacency };
}

/** Would adding prereq → dependent introduce a cycle? */
export function wouldCreateCycle(
  edges: GraphEdge[],
  prereqId: string,
  dependentId: string,
): boolean {
  return wouldCreateCycleIndexed(
    createGraphCycleIndex(edges),
    prereqId,
    dependentId,
  );
}

export function wouldCreateCycleIndexed(
  index: GraphCycleIndex,
  prereqId: string,
  dependentId: string,
): boolean {
  const seen = new Set<string>();
  const stack = [dependentId];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === prereqId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    const next = index.adjacency.get(node);
    if (next) stack.push(...next);
  }
  return false;
}

/**
 * Why the link prereq → dependent can't be added, or null when it can. Every
 * way of linking cards (dragging, the card menu, the keyboard picker) uses
 * this, so they reject the same links with the same explanation.
 */
export function linkProblem(
  index: GraphCycleIndex,
  prereqId: string,
  dependentId: string,
) {
  if (prereqId === dependentId) return "A flashcard can’t depend on itself.";
  if (index.edgeKeys.has(graphEdgeKey(prereqId, dependentId))) {
    return "Those flashcards are already linked.";
  }
  if (wouldCreateCycleIndexed(index, prereqId, dependentId)) {
    return "That link would create a cycle.";
  }
  return null;
}
