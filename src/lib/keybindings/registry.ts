import type { Keybinding } from "@/lib/shared/contracts";

export type Scope = "global" | "review" | "cram" | "deck" | "graph";

export interface Command {
  id: string;
  label: string;
  scope: Scope;
  keys: string[];
}

export const COMMANDS: Command[] = [
  { id: "nav.decks", label: "Go to decks", scope: "global", keys: ["g", "d"] },
  { id: "nav.review", label: "Go to review", scope: "global", keys: ["g", "r"] },
  { id: "nav.cram", label: "Go to cram", scope: "global", keys: ["g", "c"] },
  { id: "nav.browse", label: "Go to browse", scope: "global", keys: ["g", "b"] },
  { id: "nav.graph", label: "Go to graph", scope: "global", keys: ["g", "g"] },
  { id: "nav.settings", label: "Go to settings", scope: "global", keys: ["g", "s"] },
  { id: "nav.billing", label: "Go to billing", scope: "global", keys: ["g", "p"] },
  { id: "palette.open", label: "Open command palette", scope: "global", keys: ["mod+k"] },
  { id: "cheatsheet.open", label: "Open keybinding cheatsheet", scope: "global", keys: ["?"] },
  { id: "undo", label: "Undo last action", scope: "global", keys: ["mod+z"] },

  { id: "review.flip", label: "Flip card", scope: "review", keys: [" "] },
  { id: "review.rate.again", label: "Rate again", scope: "review", keys: ["1"] },
  { id: "review.rate.hard", label: "Rate hard", scope: "review", keys: ["2"] },
  { id: "review.rate.good", label: "Rate good", scope: "review", keys: ["3"] },
  { id: "review.rate.easy", label: "Rate easy", scope: "review", keys: ["4"] },
  { id: "review.undo", label: "Undo last rating", scope: "review", keys: ["u"] },
  { id: "review.bury", label: "Bury card", scope: "review", keys: ["b"] },
  { id: "review.suspend", label: "Suspend card", scope: "review", keys: ["s"] },
  { id: "review.mark", label: "Mark card as flagged", scope: "review", keys: ["m"] },

  { id: "cram.flip", label: "Flip card", scope: "cram", keys: [" "] },
  { id: "cram.rate.again", label: "Rate again", scope: "cram", keys: ["1"] },
  { id: "cram.rate.hard", label: "Rate hard", scope: "cram", keys: ["2"] },
  { id: "cram.rate.good", label: "Rate good", scope: "cram", keys: ["3"] },
  { id: "cram.rate.easy", label: "Rate easy", scope: "cram", keys: ["4"] },
  { id: "cram.undo", label: "Undo last rating", scope: "cram", keys: ["u"] },

  { id: "deck.newCard", label: "New card", scope: "deck", keys: ["n"] },
  { id: "deck.search", label: "Focus card search", scope: "deck", keys: ["f"] },

  { id: "graph.addEdge", label: "Add prerequisite edge", scope: "graph", keys: ["e"] },
  { id: "graph.togglePreview", label: "Toggle card preview", scope: "graph", keys: ["p"] },
];

export function getEffectiveKeymap(
  overrides: Keybinding[],
): Map<string, string[]> {
  const map = new Map<string, string[]>(
    COMMANDS.map((c) => [c.id, [...c.keys]]),
  );
  for (const o of overrides) {
    const entry = COMMANDS.find((c) => c.id === o.action);
    if (entry && o.keys.length > 0) {
      map.set(entry.id, [...o.keys]);
    }
  }
  return map;
}

export function commandById(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id);
}

export function isModifierKey(key: string): boolean {
  return ["mod", "ctrl", "cmd", "alt", "shift"].includes(key);
}
