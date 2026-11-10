import { armDeckName, uniqueDeckNames, type ImportDeck, type ImportPlan } from "@armin/core/anki";
import { AnkiImportError, openAnkiFile, type AnkiReader } from "./reader";

export type OpenedAnkiFile = {
  reader: AnkiReader;
  fileName: string;
  fileSize: number;
  openedAt: number;
  decks: ImportDeck[];
  initialPlan: ImportPlan;
};

function sourceDecks(plan: ImportPlan) {
  const decks = new Map<string, ImportDeck>();
  for (const { split, ...deck } of plan.decks) {
    const key = split?.key ?? deck.key;
    const existing = decks.get(key);
    if (existing) existing.cardCount += deck.cardCount;
    else decks.set(key, { ...deck, key, name: split ? armDeckName(deck.ankiName) : deck.name });
  }
  const list = [...decks.values()];
  const names = uniqueDeckNames(list);
  list.forEach((deck, index) => (deck.name = names[index]!));
  return list;
}

export async function openAnkiImport(file: File): Promise<OpenedAnkiFile> {
  let reader: AnkiReader | null = null;
  try {
    reader = await openAnkiFile(file);
    const openedAt = Date.now();
    const initialPlan = await reader.convert({
      progress: "keep",
      now: openedAt,
      rasterizeSvg: true,
    });
    if (initialPlan.decks.length === 0) {
      throw new AnkiImportError(
        "This file doesn't contain any cards Armin can import. Check that it's an Anki export with at least one note.",
      );
    }
    return {
      reader,
      fileName: file.name,
      fileSize: file.size,
      openedAt,
      decks: sourceDecks(initialPlan),
      initialPlan,
    };
  } catch (error) {
    reader?.close();
    throw error instanceof AnkiImportError
      ? error
      : new AnkiImportError(
          "Armin couldn't read this file. Check that it's an Anki export and try again.",
        );
  }
}

let current: OpenedAnkiFile | null = null;

export function setOpenedAnkiFile(file: OpenedAnkiFile | null) {
  if (current && current !== file) current.reader.close();
  current = file;
}

export function getOpenedAnkiFile() {
  return current;
}
