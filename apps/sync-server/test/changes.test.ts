import type { RecordData } from "@armin/sync-contract";
import { describe, expect, it } from "vitest";
import {
  card,
  cardData,
  deckData,
  find,
  newId,
  profile,
  reviewEntry,
  settingsRecord,
  signIn,
  unitData,
} from "./helpers";

async function setup() {
  const device = await signIn();
  const fixture = profile();
  const { position } = await device.upload(fixture.records);
  return { device, position, ...fixture };
}

const graphPut = (
  deckId: string,
  baseVersion: number,
  edges: RecordData["deck_graph"]["edges"],
) => ({
  op: "put" as const,
  kind: "deck_graph" as const,
  id: deckId,
  baseVersion,
  data: { edges, positions: {} },
});

describe("pushing changes", () => {
  it("the first accepted change wins; a stale one conflicts without partial writes", async () => {
    const { device, deckId, a, position } = await setup();
    const other = await signIn(device.userId);

    const [accepted] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        {
          op: "put",
          kind: "flashcard",
          id: a.id,
          baseVersion: 1,
          data: cardData(deckId, "A edited"),
        },
      ],
    });
    expect(accepted).toMatchObject({
      status: "accepted",
      records: [{ kind: "flashcard", id: a.id, version: 2, deleted: false }],
    });

    // The other device still edits from version 1, alongside a new Deck.
    const newDeckId = newId("deck");
    const [conflict] = await other.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        {
          op: "put",
          kind: "deck",
          id: newDeckId,
          baseVersion: null,
          data: deckData("New"),
        },
        {
          op: "put",
          kind: "flashcard",
          id: a.id,
          baseVersion: 1,
          data: cardData(deckId, "A other"),
        },
      ],
    });
    expect(conflict.status).toBe("conflict");
    if (conflict.status !== "conflict") return;
    expect(conflict.conflicts).toEqual([
      expect.objectContaining({
        kind: "flashcard",
        id: a.id,
        current: expect.objectContaining({ version: 2 }),
      }),
    ]);

    const { records } = await other.pullAll(position);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "flashcard",
      id: a.id,
      version: 2,
    });
    expect(find(records, "deck", newDeckId)).toBeUndefined();
  });

  it("a retried mutation returns its first result without writing twice", async () => {
    const { device, position } = await setup();
    const mutation = {
      type: "records" as const,
      mutationId: newId("m"),
      operations: [
        {
          op: "put" as const,
          kind: "deck" as const,
          id: newId("deck"),
          baseVersion: null,
          data: deckData(),
        },
      ],
    };
    const [first] = await device.push(mutation);
    const [retry] = await device.push(mutation);
    expect(retry).toEqual(first);
    expect((await device.pullAll(position)).records).toHaveLength(1);
  });

  it("a content edit must create and remove Review units to match its type", async () => {
    const { device, deckId, a } = await setup();
    const reversed = { ...cardData(deckId), type: "basic_reversed" as const };

    const [missingUnit] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        {
          op: "put",
          kind: "flashcard",
          id: a.id,
          baseVersion: 1,
          data: reversed,
        },
      ],
    });
    expect(missingUnit).toMatchObject({
      status: "rejected",
      code: "integrity",
    });

    const [accepted] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        {
          op: "put",
          kind: "flashcard",
          id: a.id,
          baseVersion: 1,
          data: reversed,
        },
        {
          op: "put",
          kind: "review_unit",
          id: newId("unit"),
          baseVersion: null,
          data: { ...unitData(a.id), subKey: "rev" },
        },
      ],
    });
    expect(accepted.status).toBe("accepted");
  });

  it("the prerequisite graph rejects stale versions, cycles, and cross-Deck links", async () => {
    const { device, deckId, a, b } = await setup();
    const otherDeck = newId("deck");
    const outsider = card(otherDeck);
    await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        {
          op: "put",
          kind: "deck",
          id: otherDeck,
          baseVersion: null,
          data: deckData("Other"),
        },
        ...outsider.records.map((r) => ({
          op: "put" as const,
          ...r,
          baseVersion: null,
        })),
      ],
    });

    const push = (edges: RecordData["deck_graph"]["edges"], baseVersion = 1) =>
      device.push({
        type: "records",
        mutationId: newId("m"),
        operations: [graphPut(deckId, baseVersion, edges)],
      });

    const [cycle] = await push([
      { prereqId: a.id, dependentId: b.id },
      { prereqId: b.id, dependentId: a.id },
    ]);
    expect(cycle).toMatchObject({ status: "rejected", code: "integrity" });

    const [crossDeck] = await push([
      { prereqId: outsider.id, dependentId: a.id },
    ]);
    expect(crossDeck).toMatchObject({ status: "rejected", code: "integrity" });

    const [reversed] = await push([{ prereqId: b.id, dependentId: a.id }]);
    expect(reversed.status).toBe("accepted");

    const [stale] = await push([], 1);
    expect(stale.status).toBe("conflict");
  });

  it("deleting a Flashcard requires removing its Review units and graph links", async () => {
    const { device, deckId, a, b, position } = await setup();
    const second = await signIn(device.userId);

    const [leftLinked] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        { op: "delete", kind: "flashcard", id: a.id, baseVersion: 1 },
        { op: "delete", kind: "review_unit", id: a.unitId, baseVersion: 1 },
      ],
    });
    expect(leftLinked).toMatchObject({ status: "rejected", code: "integrity" });

    // Review history goes with the Review unit.
    const logId = newId("log");
    await device.push({
      type: "review",
      mutationId: newId("m"),
      reviewUnitId: a.unitId,
      baseVersion: 1,
      flashcardVersion: 1,
      progress: { ...unitData(a.id).progress, reps: 1, state: 1 },
      log: { id: logId, ...reviewEntry() },
    });
    const [deleted] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        { op: "delete", kind: "flashcard", id: a.id, baseVersion: 1 },
        { op: "delete", kind: "review_unit", id: a.unitId, baseVersion: 2 },
        graphPut(deckId, 1, []),
      ],
    });
    expect(deleted).toMatchObject({ status: "accepted" });
    if (deleted.status !== "accepted") return;
    expect(deleted.records).toContainEqual({
      kind: "review_log",
      id: logId,
      version: 2,
      deleted: true,
    });

    const { records } = await second.pullAll(position);
    for (const [kind, id] of [
      ["flashcard", a.id],
      ["review_unit", a.unitId],
      ["review_log", logId],
    ]) {
      expect(find(records, kind, id)).toMatchObject({
        deleted: true,
        data: null,
      });
    }
    expect(find(records, "flashcard", b.id)).toBeUndefined();
  });

  it("a Deck can only be deleted once its Flashcards and graph are gone", async () => {
    const { device, deckId } = await setup();
    const [refused] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [{ op: "delete", kind: "deck", id: deckId, baseVersion: 1 }],
    });
    expect(refused).toMatchObject({ status: "rejected", code: "integrity" });
  });

  it("syncs Profile settings, including keybindings, and keeps them undeletable", async () => {
    const { device, position } = await setup();
    const updated = settingsRecord({
      keybindings: { "review.again": "1" },
      schedulingPreset: "custom",
    });
    const [accepted] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        {
          op: "put",
          kind: "settings",
          id: "profile",
          baseVersion: 1,
          data: updated.data as RecordData["settings"],
        },
      ],
    });
    expect(accepted.status).toBe("accepted");

    const [deleted] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        { op: "delete", kind: "settings", id: "profile", baseVersion: 2 },
      ],
    });
    expect(deleted).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });

    const other = await signIn(device.userId);
    const { records } = await other.pullAll(position);
    expect(find(records, "settings", "profile")).toMatchObject({
      version: 2,
      data: {
        keybindings: { "review.again": "1" },
        schedulingPreset: "custom",
      },
    });
  });
});
