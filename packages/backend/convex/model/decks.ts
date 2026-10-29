import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./errors";
import { MAX_DESCRIPTION_CHARS, MAX_NAME_CHARS } from "./limits";

/*
 * Deck writes shared by the app's mutations, the assistant tools, and imports.
 * Callers check ownership, versions, and capacity (`checkCapacity`) first,
 * and bump the library revision once per mutation.
 */

export function cleanDeckName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) fail("INVALID", "Deck name is required.");
  if (trimmed.length > MAX_NAME_CHARS) {
    fail("INVALID", `Deck names are limited to ${MAX_NAME_CHARS} characters.`);
  }
  return trimmed;
}

export function cleanDeckDescription(description: string | null | undefined) {
  const trimmed = description?.trim() ?? "";
  if (trimmed.length > MAX_DESCRIPTION_CHARS) {
    fail("INVALID", `Descriptions are limited to ${MAX_DESCRIPTION_CHARS} characters.`);
  }
  return trimmed || null;
}

/** The one place a deck is created. A staging deck stays hidden until its import publishes it. */
export async function insertDeck(
  ctx: MutationCtx,
  args: {
    libraryId: Id<"libraries">;
    name: string;
    description?: string | null;
    staging?: boolean;
    now: number;
  },
) {
  return ctx.db.insert("decks", {
    libraryId: args.libraryId,
    name: cleanDeckName(args.name),
    description: cleanDeckDescription(args.description),
    version: 1,
    ...(args.staging ? { staging: true } : {}),
    createdAt: args.now,
    updatedAt: args.now,
  });
}

/** Rename a deck or change its description. */
export async function updateDeckDetails(
  ctx: MutationCtx,
  deck: Doc<"decks">,
  change: { name?: string; description?: string | null },
  now: number,
) {
  const version = deck.version + 1;
  await ctx.db.patch(deck._id, {
    ...(change.name !== undefined ? { name: cleanDeckName(change.name) } : {}),
    ...(change.description !== undefined
      ? { description: cleanDeckDescription(change.description) }
      : {}),
    version,
    updatedAt: now,
  });
  return version;
}
